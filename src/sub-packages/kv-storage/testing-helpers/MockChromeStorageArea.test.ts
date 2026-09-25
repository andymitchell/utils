import { describe, it, expect } from 'vitest';

import { MockChromeStorageArea } from './MockChromeStorageArea.ts';

describe('standing in for a browser storage area', () => {

    describe('listing what it holds', () => {

        it('names every key that has been written', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1, beta: 2 });

            expect((await area.getKeys()).sort()).toEqual(['alpha', 'beta']);
        });

        it('names nothing when nothing has been written', async () => {
            const area = new MockChromeStorageArea();

            expect(await area.getKeys()).toEqual([]);
        });

        it('stops naming a key once it has been removed', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1, beta: 2 });

            await area.remove('alpha');

            expect(await area.getKeys()).toEqual(['beta']);
        });

    });

    describe('reading back what it holds', () => {

        it('returns everything when asked for nothing in particular', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1, beta: 2 });

            expect(await area.get(null)).toEqual({ alpha: 1, beta: 2 });
        });

        it('returns just the one value asked for', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1, beta: 2 });

            expect(await area.get('alpha')).toEqual({ alpha: 1 });
        });

        it('returns each of several values asked for', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1, beta: 2, gamma: 3 });

            expect(await area.get(['alpha', 'gamma'])).toEqual({ alpha: 1, gamma: 3 });
        });

        it('holds nothing after being cleared', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1 });

            await area.clear();

            expect(await area.get(null)).toEqual({});
        });

    });

    describe('reporting how much space it uses', () => {

        it('counts each key and its value as JSON, as a browser does', async () => {
            const area = new MockChromeStorageArea();
            const items = { alpha: 'x', beta: { n: 1 }, gamma: [1, 2] };
            await area.set(items);
            const bytesOf = (key: keyof typeof items) => key.length + JSON.stringify(items[key]).length;

            expect(await area.getBytesInUse('alpha')).toBe(bytesOf('alpha'));
            expect(await area.getBytesInUse(['alpha', 'gamma'])).toBe(bytesOf('alpha') + bytesOf('gamma'));
            expect(await area.getBytesInUse(null)).toBe(bytesOf('alpha') + bytesOf('beta') + bytesOf('gamma'));
            expect(await area.getBytesInUse()).toBe(await area.getBytesInUse(null));
        });

        it('counts bytes, not characters', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ café: 'é' });

            // "café" is 5 bytes in UTF-8 and "\"é\"" is 4.
            expect(await area.getBytesInUse()).toBe(9);
        });

        it('counts nothing for a key it does not hold', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 'x' });

            expect(await area.getBytesInUse('missing')).toBe(0);
        });

    });

    describe('holding only as much as its quota allows', () => {

        it('refuses a write that would take it past its quota, changing nothing and telling no listener', async () => {
            const area = new MockChromeStorageArea({ quota_bytes: 20 });
            await area.set({ alpha: 'x' });
            const changes: Record<string, unknown>[] = [];
            area.onChanged.addListener(change => changes.push(change));

            await expect(area.set({ alpha: 'y', beta: 'far too long to fit' })).rejects.toThrow('QUOTA_BYTES quota exceeded');

            expect(await area.get(null)).toEqual({ alpha: 'x' });
            expect(changes).toEqual([]);
        });

        it('accepts a write that fills its quota exactly, and refuses one a byte over', async () => {
            const items = { alpha: 'x', beta: [1, 2] };
            const bytes = await (async () => {
                const unlimited = new MockChromeStorageArea();
                await unlimited.set(items);
                return await unlimited.getBytesInUse();
            })();

            await expect(new MockChromeStorageArea({ quota_bytes: bytes }).set(items)).resolves.toBeUndefined();
            await expect(new MockChromeStorageArea({ quota_bytes: bytes - 1 }).set(items)).rejects.toThrow('QUOTA_BYTES quota exceeded');
        });

        it('counts a replaced value once', async () => {
            const area = new MockChromeStorageArea({ quota_bytes: 'alpha'.length + '"x"'.length });
            await area.set({ alpha: 'x' });

            await expect(area.set({ alpha: 'y' })).resolves.toBeUndefined();
            expect(await area.get('alpha')).toEqual({ alpha: 'y' });
        });

        it('refuses loudly to report a refused write by callback', () => {
            // A browser reports it through `chrome.runtime.lastError`, which a stand-in cannot set.
            const area = new MockChromeStorageArea({ quota_bytes: 1 });

            expect(() => area.set({ alpha: 'x' }, () => {})).toThrow('callback');
        });

    });

    describe('answering the way the caller asked', () => {

        it('calls back rather than resolving when given a callback', async () => {
            // A real area supports both forms, so an adapter written against either works here.
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1 });

            const keys = await new Promise<string[]>(resolve => area.getKeys(resolve));

            expect(keys).toEqual(['alpha']);
        });

        it('calls back with a read rather than resolving', async () => {
            const area = new MockChromeStorageArea();
            await area.set({ alpha: 1 });

            const items = await new Promise<Record<string, unknown>>(resolve => area.get<Record<string, unknown>>('alpha', resolve));

            expect(items).toEqual({ alpha: 1 });
        });

    });

    it('tells listeners what changed', async () => {
        const area = new MockChromeStorageArea();
        const changes: Record<string, unknown>[] = [];
        area.onChanged.addListener(change => changes.push(change));

        await area.set({ alpha: 1 });

        expect(changes).toEqual([{ alpha: { newValue: 1 } }]);
    });

    it('hands out a copy, so a reader cannot edit what is stored', async () => {
        const area = new MockChromeStorageArea();
        await area.set({ alpha: 1 });

        const everything = await area.get(null);
        everything['alpha'] = 'tampered';

        expect(await area.get('alpha')).toEqual({ alpha: 1 });
    });

});
