import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { commonIdbAdapterTests } from "../testing-helpers/commonIdbAdapterTests.ts";
import { IDBKeyRange } from "fake-indexeddb";
import { DexieStorage } from "./DexieStorage.ts";
import "fake-indexeddb/auto";
import { fakeIdb } from "../../fake-idb/index.ts";
import { onTestFinished, vi } from "vitest";

// Change notices travel between every store in the process with the same name, so each test gets its own.
let testCount = 0;
const uniqueName = (name: string) => `${name}-${++testCount}`;

commonAdapterTests(
    () => {
        const custom_indexeddb = fakeIdb();
        return new DexieStorage(uniqueName('testDb'),  {custom_indexeddb})
    },
    () => {
        const custom_indexeddb = fakeIdb();
        const dbName = uniqueName('testDb');
        return {
            store1: new DexieStorage(dbName, {custom_indexeddb}),
            store2: new DexieStorage(dbName, {custom_indexeddb})
        }
    },
    () => {
        return [
            {
                name: 'different stores',
                generator: () => {
                    const custom_indexeddb = fakeIdb();
                    const dbName = uniqueName('testDb');
                    return {
                        store1: new DexieStorage(dbName, {custom_indexeddb: custom_indexeddb, custom_store_name: 'store1' }),
                        store2: new DexieStorage(dbName, {custom_indexeddb: custom_indexeddb, custom_store_name: 'store2' })
                    };
                }
            },
            
            {
                name: 'different db names',
                generator: () => {
                    const custom_indexeddb = fakeIdb();
                    return {
                        store1: new DexieStorage(uniqueName('db1'), {custom_indexeddb: custom_indexeddb}),
                        store2: new DexieStorage(uniqueName('db2'), {custom_indexeddb: custom_indexeddb})
                    };
                }
            }
            
            
        ]
    }
);

commonIdbAdapterTests((dbName, factory) => new DexieStorage(dbName, {custom_indexeddb: {indexedDB: factory, IDBKeyRange}}));

describe('several stores in one database', () => {

    test.each([
        { webLocks: 'with Web Locks', stub: () => {} },
        { webLocks: 'without Web Locks', stub: () => vi.stubGlobal('navigator', { userAgent: navigator.userAgent }) }
    ])('stores first used at the same moment all work, each keeping its own data ($webLocks)', async ({ stub }) => {
        stub();
        onTestFinished(() => { vi.unstubAllGlobals() });
        const custom_indexeddb = fakeIdb();
        const dbName = uniqueName('many-stores');
        const stores = ['store1', 'store2', 'store3'].map(custom_store_name => new DexieStorage(dbName, {custom_indexeddb, custom_store_name}));
        try {
            await Promise.all(stores.map((store, index) => store.set('key1', `val${index}`)));

            expect(await Promise.all(stores.map(store => store.get('key1')))).toEqual(['val0', 'val1', 'val2']);
        } finally {
            await Promise.all(stores.map(store => store.dispose()));
        }
    }, 1000);

    test('stores in different tabs, first used at the same moment, all work, each keeping its own data', async () => {
        // A fresh copy of the module has none of this one's state, as in another tab; it shares
        // the database and the browser's locks, as another tab does.
        vi.resetModules();
        const otherTab = await import('./DexieStorage.ts');
        const custom_indexeddb = fakeIdb();
        const dbName = uniqueName('many-tabs');
        const stores = [
            new DexieStorage(dbName, {custom_indexeddb, custom_store_name: 'store1'}),
            new otherTab.DexieStorage(dbName, {custom_indexeddb, custom_store_name: 'store2'})
        ];
        try {
            await Promise.all(stores.map((store, index) => store.set('key1', `val${index}`)));

            expect(await Promise.all(stores.map(store => store.get('key1')))).toEqual(['val0', 'val1']);
        } finally {
            await Promise.all(stores.map(store => store.dispose()));
        }
    }, 1000);
});
