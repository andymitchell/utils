import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LaggyKvStorage } from './LaggyKvStorage.ts';
import { settle } from './settle.ts';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('a store whose operations take time', () => {

    it('answers a read only after its lag has passed', async () => {
        const store = new LaggyKvStorage(100);

        let answered = false;
        const read = store.get('k').then(value => { answered = true; return value; });

        await vi.advanceTimersByTimeAsync(99);
        expect(answered).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(answered).toBe(true);
        expect(await read).toBeUndefined();
    });

    it('can slow one operation and leave the rest quick', async () => {
        const store = new LaggyKvStorage((op, nth) => op === 'set' && nth === 0 ? 100 : 0);

        const settledAt: Record<string, number> = {};
        const track = (name: string, p: Promise<unknown>) => p.then(() => { settledAt[name] = Date.now(); });

        const firstWrite = track('first write', store.set('a', 1));
        const secondWrite = track('second write', store.set('b', 2));
        const read = track('read', store.get('b'));

        await vi.advanceTimersByTimeAsync(1);
        expect(settledAt).toEqual({ 'second write': 0, 'read': 0 });

        await vi.advanceTimersByTimeAsync(99);
        await Promise.all([firstWrite, secondWrite, read]);
        expect(settledAt['first write']).toBe(100);
    });

    it('counts what it was asked to do', async () => {
        const store = new LaggyKvStorage(0);

        await settle(Promise.all([store.get('a'), store.set('a', 1), store.set('b', 2)]), 1);

        expect(store.calls).toEqual({ get: 1, set: 2, remove: 0, getAllKeys: 0 });
    });

    it('can keep quiet about changes, like a store that does not relay them', async () => {
        const announcing = new LaggyKvStorage(0);
        const quiet = new LaggyKvStorage(0, { emit_changes: false });
        const heard: string[] = [];
        announcing.events.on('CHANGE', event => { heard.push(`announcing:${event.key}`); });
        quiet.events.on('CHANGE', event => { heard.push(`quiet:${event.key}`); });

        await settle(Promise.all([announcing.set('a', 1), quiet.set('b', 2)]), 1);

        expect(heard).toEqual(['announcing:a']);
        expect(await settle(quiet.get('b'), 1)).toBe(2);
    });

});
