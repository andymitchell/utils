import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { TypedCancelableEventEmitter } from '../../typed-cancelable-event-emitter/index.ts';
import type { IKvStorage, KvRawStorageEventMap } from '../../kv-storage/index-types.ts';
import { ActivityTrackerKvStorage } from './ActivityTrackerKvStorage.ts';

/**
 * Storage that takes its time answering a read, so two callers overlap the way separate
 * processes sharing durable storage really do.
 *
 * Without the delay both callers would complete before the other started, and a
 * read-then-write pair would look safe purely because nothing ever interleaved.
 */
class SlowReadStorage implements IKvStorage<any> {
    #store = new Map<string, any>();
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<any>>();

    /** How many turns of the microtask queue a read waits before answering. */
    readDelayTurns = 0;

    async set(key: string, value: any): Promise<void> {
        this.#store.set(key, value);
        this.events.emit('CHANGE', { key, newValue: value });
    }

    async get(key: string): Promise<any> {
        for (let turn = 0; turn < this.readDelayTurns; turn++) await Promise.resolve();
        return this.#store.get(key);
    }

    async remove(key: string): Promise<void> {
        this.#store.delete(key);
        this.events.emit('CHANGE', { key, newValue: undefined });
    }

    async getAllKeys(): Promise<string[]> {
        return [...this.#store.keys()];
    }

    async dispose(): Promise<void> {
        this.events.removeAllListeners();
        this.#store.clear();
    }
}

describe('two writers pausing the same shared resource at once', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps the longer pause when the shorter one is written second', async () => {
        // Whoever writes last would otherwise win, and the resource would be hammered again
        // after a second rather than left alone for the five the other writer asked for.
        const storage = new SlowReadStorage();
        const tracker = new ActivityTrackerKvStorage('shared-resource', storage);
        storage.readDelayTurns = 3;

        await Promise.all([
            tracker.setBackOffUntilTs(5000, { onlyIfExceedsCurrentTs: true }),
            tracker.setBackOffUntilTs(1000, { onlyIfExceedsCurrentTs: true })
        ]);

        expect(await tracker.getBackOffUntilTs()).toBe(5000);
    });

    it('keeps the longer pause when the shorter one is written first', async () => {
        const storage = new SlowReadStorage();
        const tracker = new ActivityTrackerKvStorage('shared-resource', storage);
        storage.readDelayTurns = 3;

        await Promise.all([
            tracker.setBackOffUntilTs(1000, { onlyIfExceedsCurrentTs: true }),
            tracker.setBackOffUntilTs(5000, { onlyIfExceedsCurrentTs: true })
        ]);

        expect(await tracker.getBackOffUntilTs()).toBe(5000);
    });

    it('still lets a caller shorten the pause when it says it means to', async () => {
        // Without the guard flag the newest value simply wins, which is how a caller
        // deliberately resets a pause it knows is no longer warranted.
        const storage = new SlowReadStorage();
        const tracker = new ActivityTrackerKvStorage('shared-resource', storage);

        await tracker.setBackOffUntilTs(5000, { onlyIfExceedsCurrentTs: true });
        await tracker.setBackOffUntilTs(1000);

        expect(await tracker.getBackOffUntilTs()).toBe(1000);
    });

});
