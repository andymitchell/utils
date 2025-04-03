import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { IdbStorage } from "./IdbStorage.ts";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

commonAdapterTests(
    () => {
        const custom_indexeddb = new IDBFactory(); // new IDBFactory();
        return new IdbStorage('testDb',  {custom_indexeddb})
    },
    () => {
        const custom_indexeddb = new IDBFactory();
        return {
            store1: new IdbStorage('testDb', {custom_indexeddb}),
            store2: new IdbStorage('testDb', {custom_indexeddb})
        }
    },
    () => {
        return [
            
            {
                name: 'different db names',
                generator: () => {
                    const custom_indexeddb = new IDBFactory();
                    return {
                        store1: new IdbStorage('db1', {custom_indexeddb: custom_indexeddb}),
                        store2: new IdbStorage('db2', {custom_indexeddb: custom_indexeddb})
                    };
                }
            }
            
            
        ]
    }
);