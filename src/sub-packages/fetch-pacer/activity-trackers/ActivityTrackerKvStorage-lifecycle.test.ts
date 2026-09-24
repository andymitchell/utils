import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityTrackerKvStorage } from './ActivityTrackerKvStorage.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';
import { settle } from '../testing-utils/settle.ts';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('winding a tracker down', () => {

    it('leaves no timer behind once disposed', async () => {
        const tracker = new ActivityTrackerKvStorage('t', new MemoryStorage());

        await settle(tracker.add({ type: 'success', timestamp: 0, points: 1 }));
        await tracker.dispose();

        expect(vi.getTimerCount()).toBe(0);
    });

    it('holds no listener on the store once disposed', async () => {
        // A store usually outlives the trackers built on it; a listener left behind keeps each
        // disposed tracker alive for as long as the store is.
        const store = new MemoryStorage();
        const listenersBefore = store.events.listenerCount('CHANGE');

        const tracker = new ActivityTrackerKvStorage('t', store);
        await settle(tracker.add({ type: 'success', timestamp: 0, points: 1 }));
        await tracker.dispose();

        expect(store.events.listenerCount('CHANGE')).toBe(listenersBefore);
    });

    it('runs no timer while it is active', async () => {
        // Every read goes to the store, so there is nothing to refresh in the background.
        const tracker = new ActivityTrackerKvStorage('t', new MemoryStorage());

        await tracker.setActive(false);
        await tracker.setActive(true);

        expect(vi.getTimerCount()).toBe(0);
        await tracker.dispose();
    });

});
