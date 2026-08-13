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
