import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { commonIdbAdapterTests } from "../testing-helpers/commonIdbAdapterTests.ts";
import { IdbStorage } from "./IdbStorage.ts";
import { DexieStorage } from "./DexieStorage.ts";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

// Change notices travel between every store in the process with the same name, so each test gets its own.
let testCount = 0;
const uniqueName = (name: string) => `${name}-${++testCount}`;

commonAdapterTests(
    () => {
        const custom_indexeddb = new IDBFactory();
        return new IdbStorage(uniqueName('testDb'),  {custom_indexeddb})
    },
    () => {
        const custom_indexeddb = new IDBFactory();
        const dbName = uniqueName('testDb');
        return {
            store1: new IdbStorage(dbName, {custom_indexeddb}),
            store2: new IdbStorage(dbName, {custom_indexeddb})
        }
    },
    () => {
        return [
            
            {
                name: 'different db names',
                generator: () => {
                    const custom_indexeddb = new IDBFactory();
                    return {
                        store1: new IdbStorage(uniqueName('db1'), {custom_indexeddb: custom_indexeddb}),
                        store2: new IdbStorage(uniqueName('db2'), {custom_indexeddb: custom_indexeddb})
                    };
                }
            }
            
            
        ]
    }
);

commonIdbAdapterTests((dbName, factory) => new IdbStorage(dbName, {custom_indexeddb: factory}));

describe('given its own IndexedDB factory', () => {

    test('works where the environment has no IndexedDB of its own', async () => {
        expect('indexedDB' in globalThis).toBe(false);

        const store = new IdbStorage(uniqueName('own-factory'), {custom_indexeddb: new IDBFactory()});
        try {
            await store.set('key1', 'val1');
            expect(await store.get('key1')).toBe('val1');
        } finally {
            await store.dispose();
        }
    });
});

describe('sharing a database with DexieStorage', () => {

    test('reads what DexieStorage wrote to a database of the same name', async () => {
        const custom_indexeddb = new IDBFactory();
        const dbName = uniqueName('shared-with-dexie');
        const dexie = new DexieStorage(dbName, {custom_indexeddb: {indexedDB: custom_indexeddb, IDBKeyRange}});
        const idb = new IdbStorage(dbName, {custom_indexeddb});
        try {
            await dexie.set('key1', 'val1');

            expect(await idb.get('key1')).toBe('val1');
        } finally {
            await Promise.all([dexie.dispose(), idb.dispose()]);
        }
    });
});
