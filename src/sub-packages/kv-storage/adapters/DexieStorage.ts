import { Dexie, type Table } from 'dexie';
import type { FakeIdb } from '../../fake-idb/types.ts';
import type { IKvStorage, KvRawStorageEventMap } from '../types.ts';
import { TypedCancelableEventEmitter } from '../../typed-cancelable-event-emitter/index.ts';
import { IDB_DATABASE_PREFIX } from './IdbStorage.ts';
import { openKeyChangeChannel, type KeyChangeChannel } from './keyChangeChannel.ts';

/**
 * A key-value store kept in the browser's IndexedDB via Dexie, in a named object store, so
 * several stores can share one database.
 *
 * Every `DexieStorage` with the same database and store name shares the same data, within a page
 * and across its tabs, workers and frames. Each of them emits `CHANGE` when any of them sets or
 * removes a key.
 *
 * @example
 * const drafts = new DexieStorage<string>('app', { custom_store_name: 'drafts' });
 * const outbox = new DexieStorage<string>('app', { custom_store_name: 'outbox' });
 * await drafts.set('d1', 'Hello');
 *
 * @remarks
 * A store missing from the database is added with an upgrade when the store is first used. Other
 * connections to the database (including other stores' ones) close and reopen for it. Within one
 * context, stores of the same database open one at a time, so each sees the others' additions.
 * Two contexts adding different stores to one database at the same moment are not coordinated.
 *
 * Every call settles: a write resolves once it is committed, and rejects if it cannot be. When
 * something else deletes or upgrades the database, the store steps aside and reopens on its next
 * call.
 *
 * A store in another context receives only the changed key and reads the value itself. The
 * `newValue` it emits is therefore the value current when the notice arrives.
 *
 * With the default store name, it shares its database and data with `IdbStorage` of the same
 * `dbName`.
 */
export class DexieStorage<T = any> implements IKvStorage<T> {
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();
    #dbName: string;
    #storeName: string;
    #fakeIdb?: FakeIdb;
    #connection?: Promise<Dexie>;
    #disposed = false;
    #notices: KeyChangeChannel;

    /**
     * @param dbName Names the IndexedDB database (prefixed with `kv-storage-`).
     * @param options.custom_indexeddb The IndexedDB to use in place of the global one (e.g. `fakeIdb()` in tests).
     * @param options.custom_store_name The object store to keep data in. Defaults to `kv_store`.
     */
    constructor(dbName: string, options?: {custom_indexeddb?:FakeIdb, custom_store_name?: string}) {
        this.#dbName = `${IDB_DATABASE_PREFIX}-${dbName}`;
        this.#storeName = options?.custom_store_name ?? 'kv_store';
        this.#fakeIdb = options?.custom_indexeddb;
        this.#notices = openKeyChangeChannel({
            dbName: this.#dbName,
            storeName: this.#storeName,
            events: this.events,
            read: key => this.get(key)
        });
    }

    async #table(): Promise<Table<T, string>> {
        const dexie = await this.#connect();
        return dexie.table(this.#storeName);
    }

    /**
     * The database every request goes through: opened on first use, and shared by every call
     * made while it is still opening. Dexie reopens it by itself after it closes.
     */
    #connect(): Promise<Dexie> {
        if (this.#disposed) return Promise.reject(new Error(`The store '${this.#storeName}' in '${this.#dbName}' has been disposed.`));
        if (!this.#connection) {
            const connection = oneAtATime(this.#dbName, () => this.#open());
            this.#connection = connection;
            // A failed open is not kept, so the next call tries again.
            connection.catch(() => {
                if (this.#connection === connection) this.#connection = undefined;
            });
        }
        return this.#connection;
    }

    /** Opens the database, first adding this store to it with an upgrade if it is missing. */
    async #open(): Promise<Dexie> {
        const existing = await readSchema(this.#dbName, this.#fakeIdb);
        const hasStore = !!existing && this.#storeName in existing.stores;

        const dexie = new Dexie(this.#dbName, { ...this.#fakeIdb });
        dexie.version((existing?.version ?? 1) + (hasStore ? 0 : 1))
            .stores(hasStore ? existing.stores : { ...existing?.stores, [this.#storeName]: '' });
        await dexie.open();
        return dexie;
    }

    /**
     * Stores `value` under `key`, then emits `CHANGE` here and notifies stores in other contexts.
     *
     * @returns Resolves once the value is committed; rejects if it could not be (e.g. the quota is full).
     */
    async set(key: string, value: T): Promise<void> {
        const table = await this.#table();
        await table.put(value, key);
        this.#notices.announce(key);
        this.events.emit('CHANGE', { key, newValue: value });
    }

    /** @returns The value stored under `key`, or `undefined` if there is none. */
    async get(key: string): Promise<T | undefined> {
        const table = await this.#table();
        return await table.get(key);
    }

    /**
     * Deletes `key`, then emits `CHANGE` with no `newValue` here and notifies stores in other contexts.
     *
     * @returns Resolves once the removal is committed; rejects if it could not be.
     */
    async remove(key: string): Promise<void> {
        const table = await this.#table();
        await table.delete(key);
        this.#notices.announce(key);
        this.events.emit('CHANGE', { key, newValue: undefined });
    }

    /**
     * Lists the stored keys, without reading any values.
     *
     * @param namespace When given, only keys starting with it are listed.
     * @returns The keys in ascending order.
     */
    async getAllKeys(namespace?: string): Promise<string[]> {
        const table = await this.#table();
        const keys = await table.toCollection().primaryKeys();
        return keys.filter(key => !namespace || key.startsWith(namespace));
    }

    /**
     * Stops listening for changes and closes the database (once it has opened, if it is still
     * opening). Calls made afterwards reject.
     */
    async dispose() {
        this.#disposed = true;
        this.#notices.close();
        this.events.removeAllListeners();
        // Not awaited: an open that another connection is blocking must not hold up disposal.
        void this.#connection?.then(dexie => dexie.close(), () => {});
        this.#connection = undefined;
    }
}

/** The version and stores (with their key paths) of an existing database, or `undefined` if there is none. */
async function readSchema(dbName: string, fakeIdb?: FakeIdb): Promise<{ version: number, stores: Record<string, string> } | undefined> {
    const dexie = new Dexie(dbName, { ...fakeIdb });
    try {
        await dexie.open();
        return {
            version: dexie.verno,
            stores: Object.fromEntries(dexie.tables.map(table => [table.name, table.schema.primKey.src || '']))
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'NoSuchDatabaseError') return undefined;
        throw error;
    } finally {
        dexie.close();
    }
}

/**
 * The latest open of each database, which the next one waits for.
 *
 * Adding a store is an upgrade decided from the schema read just before it, so opens that
 * overlap would each miss the store the other adds.
 */
const openings = new Map<string, Promise<void>>();

function oneAtATime<R>(dbName: string, work: () => Promise<R>): Promise<R> {
    const result = (openings.get(dbName) ?? Promise.resolve()).then(work);
    const settled = result.then(() => {}, () => {});
    openings.set(dbName, settled);
    void settled.then(() => {
        if (openings.get(dbName) === settled) openings.delete(dbName);
    });
    return result;
}
