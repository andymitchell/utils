import { indexedDB, IDBKeyRange, IDBFactory } from "fake-indexeddb";
import { FakeIdb } from "./types";


export function fakeIdb(shared?:boolean):FakeIdb {
    if( shared ) {
        return {
            indexedDB,
            IDBKeyRange
        }
    } else {
        const _indexedDB = new IDBFactory();
        return {
            indexedDB: _indexedDB,
            IDBKeyRange
        }
    }
}