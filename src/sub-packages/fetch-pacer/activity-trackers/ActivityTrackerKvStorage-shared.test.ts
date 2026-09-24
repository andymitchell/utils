import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityTrackerKvStorage } from './ActivityTrackerKvStorage.ts';
import { storageKeysFor } from './storageKeys.ts';
import { LaggyKvStorage } from '../testing-utils/LaggyKvStorage.ts';
import { settle } from '../testing-utils/settle.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';
import type { IKvStorage } from '../../kv-storage/index-types.ts';
import type { StoredActivityItem } from '../types.ts';

const ID = 'shared-resource';
const PREFIX = storageKeysFor(ID).logPrefix;
const RETAIN_1S = { clear_activities_older_than_ms: 1000 };

const totalPoints = (items: StoredActivityItem[]) => items.reduce((sum, item) => sum + (item.type === 'success' ? item.points : 0), 0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('several writers sharing one store for the same resource', () => {

    it('keeps every append when two writers add at the same moment', async () => {
        // Each writer's record of spend is what holds the other back; a lost entry lets both
        // pacers send more than the quota allows.
        const store = new LaggyKvStorage(1);
        const a = new ActivityTrackerKvStorage(ID, store);
        const b = new ActivityTrackerKvStorage(ID, store);

        for (let round = 0; round < 10; round++) {
            await settle(Promise.all([
                a.add({ type: 'success', timestamp: round, points: 10 }),
                b.add({ type: 'success', timestamp: round, points: 10 })
            ]));
        }

        const seenByA = await settle(a.list());
        const seenByB = await settle(b.list());
        expect(seenByA).toHaveLength(20);
        expect(totalPoints(seenByA)).toBe(200);
        expect(seenByB).toHaveLength(20);
        expect(totalPoints(seenByB)).toBe(200);
    });

    it('shows a writer what the others have added, oldest first', async () => {
        // Refusals are counted since the most recent success, whoever recorded it, so the
        // combined history must read in the order things happened.
        const store = new LaggyKvStorage(1);
        const a = new ActivityTrackerKvStorage(ID, store);
        const b = new ActivityTrackerKvStorage(ID, store);

        await settle(a.add({ type: 'success', timestamp: 5, points: 1 }));
        await settle(b.add({ type: 'success', timestamp: 3, points: 1 }));

        const seenByA = await settle(a.list());
        const seenByB = await settle(b.list());
        expect(seenByA.map(item => item.timestamp)).toEqual([3, 5]);
        expect(seenByB).toEqual(seenByA);
    });

    it('notices a writer that appeared after it started even when the store announces nothing', async () => {
        const store = new LaggyKvStorage(1, { emit_changes: false });
        const b = new ActivityTrackerKvStorage(ID, store);
        const a = new ActivityTrackerKvStorage(ID, store);

        await settle(a.add({ type: 'success', timestamp: 0, points: 7 }), 1);
        const seenByB = await settle(b.list(), 1);

        expect(seenByB).toEqual([expect.objectContaining({ type: 'success', timestamp: 0, points: 7 })]);
    });

    it('still counts what an earlier version stored under the shared key', async () => {
        const store = new LaggyKvStorage(1);
        await settle(store.set(PREFIX, [{ type: 'success', timestamp: 0, points: 5, id: 'x' }]), 1);

        const tracker = new ActivityTrackerKvStorage(ID, store);

        expect(await settle(tracker.list(), 1)).toEqual([{ type: 'success', timestamp: 0, points: 5, id: 'x' }]);
    });

    it('clears away what an earlier version stored under the shared key once none of it counts', async () => {
        const store = new LaggyKvStorage(1);
        await settle(store.set(PREFIX, [{ type: 'success', timestamp: 0, points: 5, id: 'x' }]), 1);
        const tracker = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);

        await settle(tracker.add({ type: 'success', timestamp: Date.now(), points: 1 }), 1);
        expect(await settle(tracker.list(), 1)).toContainEqual(expect.objectContaining({ id: 'x' }));

        await vi.advanceTimersByTimeAsync(2001 - Date.now());
        await settle(tracker.add({ type: 'success', timestamp: Date.now(), points: 1 }), 1);
        expect(await settle(store.get(PREFIX), 1)).toBeUndefined();
    });

    it('clears away a departed writer\'s history once nothing in it can count, with nobody reading', async () => {
        // A pacer with no quota never reads the history, only records refusals and successes,
        // so recording alone must be enough to keep the store from growing.
        const store = new LaggyKvStorage(1);
        const a = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        await settle(a.add({ type: 'success', timestamp: 0, points: 10 }), 1);
        await a.dispose();
        const b = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);

        // A writer that has gone away still spent inside the window, so others must see it.
        await vi.advanceTimersByTimeAsync(500 - Date.now());
        expect(await settle(b.list(), 1)).toEqual([expect.objectContaining({ timestamp: 0, points: 10 })]);

        await vi.advanceTimersByTimeAsync(2001 - Date.now());
        await settle(b.add({ type: 'success', timestamp: 2001, points: 5 }), 1);

        const keys = await settle(store.getAllKeys(PREFIX), 1);
        expect(keys).toHaveLength(1);
        expect(await settle(store.get(keys[0]!), 1)).toEqual([expect.objectContaining({ timestamp: 2001, points: 5 })]);
    });

    it('never loses a charge stored just as the one before it ages out', async () => {
        // While the charge is still being stored, one writer finishes recording a request of its
        // own and another reads. Both find the store holding nothing but an entry that has just
        // aged, and the charge must survive that.
        const store = new LaggyKvStorage(op => op === 'set' ? 20 : op === 'remove' ? 50 : 0);
        const a = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        const b = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        const c = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        await settle(a.add({ type: 'success', timestamp: 0, points: 10 }), 1);

        await vi.advanceTimersByTimeAsync(985 - Date.now());
        const recording = b.add({ type: 'success', timestamp: 985, points: 0 });
        await vi.advanceTimersByTimeAsync(990 - Date.now());
        const charging = a.add({ type: 'success', timestamp: 990, points: 10 });
        await vi.advanceTimersByTimeAsync(1005 - Date.now());
        await settle(Promise.all([recording, charging, c.list()]), 1);

        await vi.advanceTimersByTimeAsync(1100 - Date.now());
        const charge = expect.objectContaining({ timestamp: 990, points: 10 });
        for (const tracker of [a, b, c]) {
            expect(await settle(tracker.list(), 1)).toContainEqual(charge);
        }
    });

    it('never throws away a charge that lands while it is tidying up', async () => {
        // One writer reads and records, clearing away another's stale history, just as that other
        // writer records a new request. The new request must survive, or both pacers undercount it.
        const store = new LaggyKvStorage(op => op === 'remove' ? 50 : 0);
        const a = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        const b = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        await settle(a.add({ type: 'success', timestamp: 0, points: 10 }), 1);

        await vi.advanceTimersByTimeAsync(2000 - Date.now());
        const tidy = Promise.all([b.list(), b.add({ type: 'success', timestamp: 2000, points: 0 })]);
        await vi.advanceTimersByTimeAsync(3); // b has found a's history stale; clearing it is still under way
        await settle(a.add({ type: 'success', timestamp: 2003, points: 10 }), 1);
        await settle(tidy, 1);

        const fresh = expect.objectContaining({ timestamp: 2003, points: 10 });
        expect(await settle(b.list(), 1)).toContainEqual(fresh);
        expect(await settle(a.list(), 1)).toContainEqual(fresh);
    });

    it('still records a charge when clearing away old history fails, and logs the failure for debugging', async () => {
        // Clearing up is housekeeping: a store that cannot list its keys for it must not turn a
        // charge that was stored into a failure the pacer reports. The failure is still logged, so
        // a store that keeps growing can be traced back to it.
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const inner: IKvStorage = new MemoryStorage();
        const cannotList: IKvStorage = {
            events: inner.events,
            get: key => inner.get(key),
            set: (key, value) => inner.set(key, value),
            remove: key => inner.remove(key),
            getAllKeys: async () => { throw new Error('listing unavailable'); },
            dispose: () => inner.dispose()
        };
        const tracker = new ActivityTrackerKvStorage(ID, cannotList, RETAIN_1S);

        await expect(tracker.add({ type: 'reserved', timestamp: 0, points: 10 })).resolves.toBeUndefined();
        expect(debug).toHaveBeenCalledWith(expect.any(String), new Error('listing unavailable'));

        const reader = new ActivityTrackerKvStorage(ID, inner, RETAIN_1S);
        expect(await reader.list()).toEqual([expect.objectContaining({ type: 'reserved', points: 10 })]);
    });

    it('asks the store for nothing but the key list when it is the only writer', async () => {
        // Its own history is already in hand; reading it back would only add latency to every check.
        const store = new LaggyKvStorage(1);
        const tracker = new ActivityTrackerKvStorage(ID, store);

        await settle(tracker.add({ type: 'success', timestamp: 0, points: 10 }), 1);
        expect(await settle(tracker.list(), 1)).toEqual([expect.objectContaining({ points: 10 })]);

        expect(store.calls.get).toBe(0);
    });

    it('keeps counting its own charges after it moves on to recording in a new segment', async () => {
        // A segment stops taking entries one retention period after its first, but an entry made
        // just before then still counts for almost another whole period.
        const tracker = new ActivityTrackerKvStorage(ID, new MemoryStorage(), RETAIN_1S);
        await tracker.add({ type: 'reserved', timestamp: 0, points: 10 });
        vi.setSystemTime(900);
        await tracker.add({ type: 'reserved', timestamp: 900, points: 20 });

        vi.setSystemTime(1200);
        await tracker.add({ type: 'reserved', timestamp: 1200, points: 30 });

        expect((await tracker.list()).map(item => item.timestamp)).toEqual([900, 1200]);
    });

});
