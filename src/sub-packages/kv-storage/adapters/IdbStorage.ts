
import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";
import { openKeyChangeChannel, type KeyChangeChannel } from "./keyChangeChannel.ts";

export const IDB_DATABASE_PREFIX = 'kv-storage';

/**
 * The one object store in each database. It is fixed because adding a store to a database means
 * upgrading it, which every other open connection to it would have to step aside for.
 */
const STORE_NAME = 'kv_store';

/**
 * A key-value store kept in the browser's IndexedDB, in a database of its own.
 *
 * Every `IdbStorage` created with the same `dbName` shares the same data, within a page and
 * across its tabs, workers and frames. Each of them emits `CHANGE` when any of them sets or
 * removes a key.
 *
 * @example
 * const storage = new IdbStorage<string>('settings');
 * storage.events.on('CHANGE', ({ key, newValue }) => render(key, newValue));
 * await storage.set('theme', 'dark');
 *
 * @remarks
 * Every call settles: a write resolves once it is committed, and rejects if it cannot be (for
 * example when the quota is full) rather than leaving the caller waiting.
 *
 * The store never stands in another connection's way. When something else deletes or upgrades
 * the database, the store closes its connection. The next call opens a fresh one, whether the
 * store closed it or the browser did. After a delete the store starts empty.
 *
 * It opens whatever version of the database already exists, so it can share a database with
 * `DexieStorage` of the same `dbName` and default store name.
 *
 * A store in another context receives only the changed key and reads the value itself. The
 * `newValue` it emits is therefore the value current when the notice arrives.
 */
export class IdbStorage<T = any> implements IKvStorage<T> {
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();
    #dbName: string;
    #indexedDbFactory: IDBFactory;
    #connection?: Promise<IDBDatabase>;
    #disposed = false;
    #notices: KeyChangeChannel;

    /**
     * @param dbName Names the IndexedDB database (prefixed with `kv-storage-`). Give the store a
     * database of its own: its one object store is created when the database is.
     * @param options.custom_indexeddb The IndexedDB to use in place of the global `indexedDB`
     * (e.g. `fake-indexeddb` in tests). The global is never touched when this is given.
     */
    constructor(dbName: string, options?: { custom_indexeddb?: IDBFactory }) {
        this.#dbName = `${IDB_DATABASE_PREFIX}-${dbName}`;
        this.#indexedDbFactory = options?.custom_indexeddb ?? indexedDB;
        this.#notices = openKeyChangeChannel({
            dbName: this.#dbName,
            storeName: STORE_NAME,
            events: this.events,
            read: key => this.get(key)
        });
    }

    /**
     * The connection every request goes through: opened on first use, and shared by every call
     * made while it is still opening.
     */
    #connect(): Promise<IDBDatabase> {
        if (this.#disposed) return Promise.reject(new Error(`The store for '${this.#dbName}' has been disposed.`));
        if (!this.#connection) {
            const connection = this.#open(() => this.#forget(connection));
            this.#connection = connection;
            // A failed open is not kept, so the next call tries again.
            connection.catch(() => this.#forget(connection));
        }
        return this.#connection;
    }

    /** Drops `connection` so the next call opens a fresh one (unless it has already been replaced). */
    #forget(connection: Promise<IDBDatabase>): void {
        if (this.#connection === connection) this.#connection = undefined;
    }

    /**
     * Opens the database, creating the store on first use.
     *
     * @param onGone Called once the connection can no longer be used.
     */
    #open(onGone: () => void): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            // No version: whatever version exists is fine (others may have upgraded it); a new database starts at 1.
            const req = this.#indexedDbFactory.open(this.#dbName);
            // Stepping aside lets another connection's delete or upgrade go ahead; the next call reopens.
            // Watched from the upgrade onwards, because that request can arrive before `success`.
            const watch = (db: IDBDatabase) => {
                db.onversionchange = () => {
                    db.close();
                    onGone();
                };
            };
            req.onupgradeneeded = () => {
                watch(req.result);
                req.result.createObjectStore(STORE_NAME);
            };
            req.onsuccess = () => {
                watch(req.result);
                resolve(req.result);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Runs one request in its own transaction, settling once the transaction has committed or
     * aborted — so a write is only reported saved once it is durable, and a failed commit (e.g. a
     * full quota, which fires only `abort`) rejects instead of leaving the caller waiting.
     */
    async #run<R>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<R>, retries = 1): Promise<R> {
        const connection = this.#connect();
        let tx: IDBTransaction;
        try {
            tx = (await connection).transaction(STORE_NAME, mode);
        } catch (error) {
            // The connection closed before it could be used: while opening, to let another connection's
            // upgrade through (the open then aborts), or later (some browsers close without any event).
            // Try once more on a fresh one.
            if (retries > 0 && error instanceof Error && (error.name === 'AbortError' || error.name === 'InvalidStateError')) {
                this.#forget(connection);
                return this.#run(mode, request, retries - 1);
            }
            throw error;
        }
        return new Promise<R>((resolve, reject) => {
            const req = request(tx.objectStore(STORE_NAME));
            tx.oncomplete = () => resolve(req.result);
            // `abort` also follows a failed request, carrying its error; an abort with no error is still a failure.
            tx.onabort = () => reject(tx.error ?? new DOMException('The transaction was aborted.', 'AbortError'));
        });
    }

    /**
     * Stores `value` under `key`, then emits `CHANGE` here and notifies stores in other contexts.
     *
     * @returns Resolves once the value is committed; rejects if it could not be (e.g. the quota is full).
     */
    async set(key: string, value: T): Promise<void> {
        await this.#run('readwrite', store => store.put(value, key));
        this.#notices.announce(key);
        this.events.emit("CHANGE", { key, newValue: value });
    }

    /** @returns The value stored under `key`, or `undefined` if there is none. */
    async get(key: string): Promise<T | undefined> {
        return await this.#run('readonly', store => store.get(key));
    }

    /**
     * Deletes `key`, then emits `CHANGE` with no `newValue` here and notifies stores in other contexts.
     *
     * @returns Resolves once the removal is committed; rejects if it could not be.
     */
    async remove(key: string): Promise<void> {
        await this.#run('readwrite', store => store.delete(key));
        this.#notices.announce(key);
        this.events.emit("CHANGE", { key, newValue: undefined });
    }

    /**
     * Lists the stored keys, without reading any values.
     *
     * @param namespace When given, only keys starting with it are listed.
     * @returns The keys in ascending order.
     */
    async getAllKeys(namespace?: string): Promise<string[]> {
        const keys = await this.#run('readonly', store => store.getAllKeys());
        return keys.map(String).filter(key => !namespace || key.startsWith(namespace));
    }

    /**
     * Stops listening for changes and closes the connection (once it has opened, if it is still
     * opening). Calls made afterwards reject.
     */
    async dispose() {
        this.#disposed = true;
        this.#notices.close();
        this.events.removeAllListeners();
        // Not awaited: an open that another connection is blocking must not hold up disposal.
        void this.#connection?.then(db => db.close(), () => {});
        this.#connection = undefined;
    }
}
