import { IDBFactory } from "fake-indexeddb";
import { vi } from "vitest";
import type { IKvStorage } from "../types.ts";
import { countValueReads, deleteDatabase, failCommitsFor, forceClose, upgradeDatabase, watchConnections } from "./idbProbes.ts";

/**
 * Hang guard for tests whose failure mode is a promise that never settles: they fail fast
 * instead of waiting for the default timeout.
 */
const HANG_GUARD_MS = 1000;

/** A version above any the adapters create, as a newer build in another tab might ask for. */
const NEWER_VERSION = 1000;

/**
 * Tests the promises an IndexedDB-backed adapter makes on top of the common adapter contract:
 * it never leaves a caller waiting forever, it never stands in the way of other connections to
 * its database, and it recovers by itself when the browser takes its connection away.
 *
 * @param create Makes a store over the database `dbName`, using only `factory` to reach IndexedDB.
 */
export function commonIdbAdapterTests(create: (dbName: string, factory: IDBFactory) => IKvStorage) {

    let testCount = 0;
    let factory: IDBFactory;
    let dbName: string;
    let stores: IKvStorage[] = [];

    beforeEach(() => {
        factory = new IDBFactory();
        dbName = `idb-adapter-test-${++testCount}`;
    });

    afterEach(async () => {
        const disposing = stores;
        stores = [];
        await Promise.all(disposing.map(store => store.dispose()));
        vi.restoreAllMocks();
    });

    const newStore = () => {
        const store = create(dbName, factory);
        stores.push(store);
        return store;
    };

    describe('IndexedDB behaviour', () => {

        describe('when a write cannot be committed (e.g. the disk or quota is full)', () => {

            test('the write fails rather than never settling', async () => {
                const store = newStore();
                failCommitsFor('full');

                await expect(store.set('full', 'value')).rejects.toMatchObject({ name: 'AbortError' });
            }, HANG_GUARD_MS);

            test('the removal fails rather than never settling', async () => {
                const store = newStore();
                await store.set('full', 'value');
                failCommitsFor('full');

                await expect(store.remove('full')).rejects.toMatchObject({ name: 'AbortError' });
            }, HANG_GUARD_MS);

            test("a caller's queue of writes carries on past the failed one", async () => {
                const store = newStore();
                failCommitsFor('full');

                const outcomes: string[] = [];
                for (const key of ['full', 'next']) {
                    outcomes.push(await store.set(key, 'value').then(() => 'saved', () => 'failed'));
                }

                expect(outcomes).toEqual(['failed', 'saved']);
                expect(await store.get('next')).toBe('value');
            }, HANG_GUARD_MS);

            test('the value from before the failed write is kept', async () => {
                const store = newStore();
                await store.set('full', 'before');
                failCommitsFor('full');

                await store.set('full', 'after').catch(() => {});

                expect(await store.get('full')).toBe('before');
            }, HANG_GUARD_MS);
        });

        describe('when another connection needs the database', () => {

            test('deleting the database is not blocked by an idle store', async () => {
                const { firstOpen } = watchConnections(factory);
                const store = newStore();
                await store.set('a', '1');

                expect(await deleteDatabase(factory, await firstOpen)).toBe('deleted');
            }, HANG_GUARD_MS);

            test('the store carries on after its database is deleted, starting empty', async () => {
                const { firstOpen } = watchConnections(factory);
                const store = newStore();
                await store.set('a', '1');
                await deleteDatabase(factory, await firstOpen);

                expect(await store.get('a')).toBeUndefined();
                await store.set('b', '2');
                expect(await store.get('b')).toBe('2');
            }, HANG_GUARD_MS);

            test('upgrading the database is not blocked, even while the store is still opening it', async () => {
                const { firstOpen } = watchConnections(factory);
                const store = newStore();

                const firstUse = store.set('a', '1');
                const upgrade = upgradeDatabase(factory, await firstOpen, NEWER_VERSION);

                expect(await upgrade).toBe('upgraded');
                await firstUse;
                expect(await store.get('a')).toBe('1');
            }, HANG_GUARD_MS);

            test('the store carries on after its database is upgraded, keeping its data', async () => {
                const { firstOpen } = watchConnections(factory);
                const store = newStore();
                await store.set('a', '1');
                expect(await upgradeDatabase(factory, await firstOpen, NEWER_VERSION)).toBe('upgraded');

                expect(await store.get('a')).toBe('1');
                await store.set('b', '2');
                expect(await store.get('b')).toBe('2');
            }, HANG_GUARD_MS);
        });

        describe('when the browser closes the connection', () => {

            test('the next call reopens it, and stored data is still there', async () => {
                const { connections } = watchConnections(factory);
                const store = newStore();
                await store.set('a', '1');

                for (const db of await connections()) forceClose(db);

                expect(await store.get('a')).toBe('1');
                await store.set('b', '2');
                expect(await store.get('b')).toBe('2');
            }, HANG_GUARD_MS);

            test('the next call also reopens a connection that closed without any notice', async () => {
                const { connections } = watchConnections(factory);
                const store = newStore();
                await store.set('a', '1');

                for (const db of await connections()) db.close();

                expect(await store.get('a')).toBe('1');
                await store.set('b', '2');
                expect(await store.get('b')).toBe('2');
            }, HANG_GUARD_MS);
        });

        describe('listing keys', () => {

            test('reads no stored values, with or without a prefix', async () => {
                const store = newStore();
                await store.set('ns1.a', 'a large value');
                await store.set('ns2.b', 'a large value');

                const valueReads = countValueReads();
                await store.getAllKeys();
                await store.getAllKeys('ns1');

                expect(valueReads()).toBe(0);
            });

            test('lists exactly the keys that start with the prefix', async () => {
                const store = newStore();
                const keys = ['a', 'ab', 'abc', 'a.b', 'b', 'ba', 'A', 'ä'];
                for (const key of keys) await store.set(key, 'value');

                for (const prefix of ['', 'a', 'ab', 'abc', 'abcd', 'a.', 'b', 'A', 'z']) {
                    const listed = await store.getAllKeys(prefix);
                    expect([...listed].sort()).toEqual(keys.filter(key => key.startsWith(prefix)).sort());
                }
            });
        });

        describe('change notices sent to other contexts', () => {

            test('name the changed key, but never carry the stored value', async () => {
                const posted = vi.spyOn(BroadcastChannel.prototype, 'postMessage');
                const store = newStore();

                await store.set('key1', 'a large value');
                await store.remove('key1');

                // Libraries underneath may post their own messages too, so only the content is checked.
                expect(JSON.stringify(posted.mock.calls)).toContain('key1');
                expect(JSON.stringify(posted.mock.calls)).not.toContain('a large value');
            });
        });

        describe('connections', () => {

            test('calls made together on first use share one connection', async () => {
                const { connections } = watchConnections(factory);
                const store = newStore();

                await Promise.all([store.set('a', '1'), store.get('a'), store.getAllKeys(), store.remove('b')]);

                expect(await connections()).toHaveLength(1);
            });

            test('dispose leaves no connection open, even while the first one is still opening', async () => {
                const { connections } = watchConnections(factory);
                const store = newStore();

                const inFlight = store.set('a', '1');
                await store.dispose();
                await inFlight.catch(() => {});

                expect(await connections()).toHaveLength(0);
            });

            test('after dispose, calls fail and open nothing', async () => {
                const { connections } = watchConnections(factory);
                const store = newStore();

                await store.dispose();

                await expect(store.get('a')).rejects.toThrow();
                await expect(store.set('a', '1')).rejects.toThrow();
                expect(await connections()).toHaveLength(0);
            });
        });
    });
}
