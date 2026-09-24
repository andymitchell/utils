import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityTrackerKvStorage } from './ActivityTrackerKvStorage.ts';
import { LaggyKvStorage } from '../testing-utils/LaggyKvStorage.ts';
import { settle } from '../testing-utils/settle.ts';
import type { StoredActivityItem } from '../types.ts';

const ID = 'shared-resource';
const PREFIX = `fetch_pacer_activity_tracker_${ID}.activities`;
const RETAIN_1S = { clear_activities_older_than_ms: 1000 };

const totalPoints = (items: StoredActivityItem[]) => items.reduce((sum, item) => sum + (item.type === 'success' ? item.points : 0), 0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
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

    it('clears a segment whose every entry has aged out', async () => {
        const store = new LaggyKvStorage(1);
        const a = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        await settle(a.add({ type: 'success', timestamp: 0, points: 10 }), 1);
        await a.dispose();
        const b = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);

        // A writer that has gone away still spent inside the window, so others must see it.
        await vi.advanceTimersByTimeAsync(500 - Date.now());
        expect(await settle(b.list(), 1)).toEqual([expect.objectContaining({ timestamp: 0, points: 10 })]);
        expect(await settle(store.getAllKeys(PREFIX), 1)).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(2000 - Date.now());
        expect(await settle(b.list(), 1)).toEqual([]);
        expect(await settle(store.getAllKeys(PREFIX), 1)).toEqual([]);
    });

    it('never throws away a charge that lands while it is tidying up', async () => {
        // One writer clears away another's stale history just as that other writer records a
        // new request. The new request must survive, or both pacers undercount it.
        const store = new LaggyKvStorage(op => op === 'remove' ? 50 : 0);
        const a = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        const b = new ActivityTrackerKvStorage(ID, store, RETAIN_1S);
        await settle(a.add({ type: 'success', timestamp: 0, points: 10 }), 1);

        await vi.advanceTimersByTimeAsync(2000 - Date.now());
        const tidy = b.list();
        await vi.advanceTimersByTimeAsync(1); // b has found a's history stale; its delete is still under way
        await settle(a.add({ type: 'success', timestamp: 2001, points: 10 }), 1);
        await settle(tidy, 1);

        const fresh = expect.objectContaining({ timestamp: 2001, points: 10 });
        expect(await settle(b.list(), 1)).toEqual([fresh]);
        expect(await settle(a.list(), 1)).toEqual([fresh]);
        expect(await settle(store.getAllKeys(PREFIX), 1)).toHaveLength(1);
    });

    it('asks the store for nothing but the key list when it is the only writer', async () => {
        // Its own history is already in hand; reading it back would only add latency to every check.
        const store = new LaggyKvStorage(1);
        const tracker = new ActivityTrackerKvStorage(ID, store);

        await settle(tracker.add({ type: 'success', timestamp: 0, points: 10 }), 1);
        expect(await settle(tracker.list(), 1)).toEqual([expect.objectContaining({ points: 10 })]);

        expect(store.calls.get).toBe(0);
    });

});
