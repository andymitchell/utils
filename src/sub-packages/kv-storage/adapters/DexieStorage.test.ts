import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { DexieStorage } from "./DexieStorage.ts";
import "fake-indexeddb/auto";
import { fakeIdb } from "../../fake-idb/index.ts";

commonAdapterTests(
    () => {
        const custom_indexeddb = fakeIdb(); // fakeIdb();
        return new DexieStorage('testDb',  {custom_indexeddb})
    },
    () => {
        const custom_indexeddb = fakeIdb();
        return {
            store1: new DexieStorage('testDb', {custom_indexeddb}),
            store2: new DexieStorage('testDb', {custom_indexeddb})
        }
    },
    () => {
        return [
            {
                name: 'different stores',
                generator: () => {
                    const custom_indexeddb = fakeIdb();
                    return {
                        store1: new DexieStorage('testDb', {custom_indexeddb: custom_indexeddb, custom_store_name: 'store1' }),
                        store2: new DexieStorage('testDb', {custom_indexeddb: custom_indexeddb, custom_store_name: 'store2' })
                    };
                }
            },
            
            {
                name: 'different db names',
                generator: () => {
                    const custom_indexeddb = fakeIdb();
                    return {
                        store1: new DexieStorage('db1', {custom_indexeddb: custom_indexeddb}),
                        store2: new DexieStorage('db2', {custom_indexeddb: custom_indexeddb})
                    };
                }
            }
            
            
        ]
    }
);