
import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";

export const IDB_DATABASE_PREFIX = 'kv-storage';
const CHANNEL_PREFIX = "kv-storage-channel";

export class IdbStorage<T = any> implements IKvStorage<T> {
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();
    #dbName: string;

    /**
     * This has to be locked because IndexedDb struggles to do the update. 
     * It can dynamically add a store during connection, *unless* something else (e.g. another instance of this class) is also holding a connection. 
     * Dexie solves this by telling all other Dexie instances to drop their connection temporarily, but that's just too much. It was easier to lock the name. 
     */
    #storeName: Readonly<string> = 'kv_store';
    #indexedDbFactory = indexedDB;
    #db!: IDBDatabase;
    #broadcast;

    /**
     * 
     * @param dbName You should probably use a database just for holding this store, because IDB isn't great at adding stores to an existing database.
     * @param options 
     */
    constructor(dbName: string, options?: { custom_indexeddb?: IDBFactory }) {
        this.#dbName = `${IDB_DATABASE_PREFIX}-${dbName}`;
        if (options?.custom_indexeddb) this.#indexedDbFactory = options.custom_indexeddb;
        this.#broadcast = new BroadcastChannel(CHANNEL_PREFIX + dbName + this.#storeName);
        this.#broadcast.onmessage = (event) => {
            const { key, newValue } = event.data;
            this.events.emit("CHANGE", { key, newValue });
        };
    }

    
    async #init(): Promise<IDBDatabase> {
        if (this.#db) return this.#db;

        this.#db = await new Promise((resolve, reject) => {
            const req = this.#indexedDbFactory.open(this.#dbName, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.#storeName);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        return this.#db;
    }
    

    async set(key: string, value: T): Promise<void> {
        const db = await this.#init();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(this.#storeName, "readwrite");
            const store = tx.objectStore(this.#storeName);
            store.put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        this.#broadcast.postMessage({ key, newValue: value });
        this.events.emit("CHANGE", { key, newValue: value });
    }

    async get(key: string): Promise<T | undefined> {
        console.log("Get 1");
        const db = await this.#init();
        console.log("Get 2");
        return await new Promise<T | undefined>((resolve, reject) => {
            const tx = db.transaction(this.#storeName, "readonly");
            const store = tx.objectStore(this.#storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async remove(key: string): Promise<void> {
        const db = await this.#init();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(this.#storeName, "readwrite");
            const store = tx.objectStore(this.#storeName);
            store.delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        this.#broadcast.postMessage({ key, newValue: undefined });
        this.events.emit("CHANGE", { key, newValue: undefined });
    }

    async getAllKeys(namespace?: string): Promise<string[]> {
        const db = await this.#init();
        return await new Promise<string[]>((resolve, reject) => {
            const tx = db.transaction(this.#storeName, "readonly");
            const store = tx.objectStore(this.#storeName);
            const keys: string[] = [];
            const req = store.openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    if (!namespace || cursor.key.toString().startsWith(namespace)) {
                        keys.push(cursor.key.toString());
                    }
                    cursor.continue();
                } else {
                    resolve(keys);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    dispose() {
        this.#broadcast.close();
        this.events.removeAllListeners();
        this.#db?.close();
    }
}