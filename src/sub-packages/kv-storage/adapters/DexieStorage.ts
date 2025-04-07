import { Dexie, type Table } from 'dexie';
import type { FakeIdb } from '../../fake-idb/types.ts';
import type { IKvStorage, KvRawStorageEventMap } from '../types.ts';
import { TypedCancelableEventEmitter } from '../../typed-cancelable-event-emitter/index.ts';
import { IDB_DATABASE_PREFIX } from './IdbStorage.ts';

const CHANNEL_PREFIX = 'kv-storage-channel';

/**
 * The main advantage this offers over IdbStorage is that you can have a custom store name.
 */
export class DexieStorage<T = any> implements IKvStorage<T> {
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();
    #dbName: string;
    #storeName: string;
    #fakeIdb?: FakeIdb;
    #dexie!: Dexie;
    #broadcast: BroadcastChannel;

    constructor(dbName: string, options?: {custom_indexeddb?:FakeIdb, custom_store_name?: string}) {
        this.#dbName = `${IDB_DATABASE_PREFIX}-${dbName}`;
        this.#storeName = options?.custom_store_name ?? 'kv_store';
        this.#fakeIdb = options?.custom_indexeddb;
        this.#broadcast = new BroadcastChannel(CHANNEL_PREFIX + this.#dbName + this.#storeName);
        this.#broadcast.onmessage = (event) => {
            const { key, newValue } = event.data;
            this.events.emit('CHANGE', { key, newValue });
        };
    }

    async #init(): Promise<Table<T, string>> {
        if (this.#dexie && this.#dexie.tables.some(t => t.name === this.#storeName)) {
            return this.#dexie.table(this.#storeName);
        }
    
        this.#dexie?.close();
    
        const schema: Record<string, string> = {};
        let currentVersion = 1;
        let needsUpgrade = true;
    
        try {
            const temp = new Dexie(this.#dbName, { ...this.#fakeIdb });
            await temp.open();
            currentVersion = temp.verno;
    
            for (const table of temp.tables) {
                // Preserve existing stores and their key definitions
                const pk = table.schema.primKey.src;
                if (table.name === this.#storeName) {
                    // Store already exists, do NOT try to redefine it
                    needsUpgrade = false;
                }
                schema[table.name] = pk || ''; // '' for inline/manual key
            }
    
            temp.close();
        } catch (err: any) {
            if (err.name !== 'NoSuchDatabaseError') throw err;
        }
    
        this.#dexie = new Dexie(this.#dbName, { ...this.#fakeIdb });
    
        if (needsUpgrade) {
            // Add the new store
            schema[this.#storeName] = ''; // define new store only
            this.#dexie.version(currentVersion + 1).stores(schema);
        } else {
            // Reuse existing schema version
            this.#dexie.version(currentVersion).stores(schema);
        }
    
        await this.#dexie.open();
        return this.#dexie.table(this.#storeName);
    }

    async set(key: string, value: T): Promise<void> {
        const table = await this.#init();
        await table.put(value, key);
        this.#broadcast.postMessage({ key, newValue: value });
        this.events.emit('CHANGE', { key, newValue: value });
    }

    async get(key: string): Promise<T | undefined> {
        const table = await this.#init();
        return await table.get(key);
    }

    async remove(key: string): Promise<void> {
        const table = await this.#init();
        await table.delete(key);
        this.#broadcast.postMessage({ key, newValue: undefined });
        this.events.emit('CHANGE', { key, newValue: undefined });
    }

    async getAllKeys(namespace?: string): Promise<string[]> {
        const table = await this.#init();
        const keys: string[] = [];

        await table.each((_, cursor) => {
            const key = cursor.key;
            if (!namespace || key.toString().startsWith(namespace)) {
                keys.push(key.toString());
            }
        });

        return keys;
    }

    async dispose() {
        this.#broadcast.close();
        this.events.removeAllListeners();
        this.#dexie?.close();
    }
}
