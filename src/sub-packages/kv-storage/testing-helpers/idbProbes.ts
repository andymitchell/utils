import { forceCloseDatabase, IDBIndex, IDBObjectStore } from "fake-indexeddb";
import { vi } from "vitest";

/**
 * Observes the real (fake-indexeddb) engine from the outside, so tests can assert what a storage
 * adapter does to the database — connections left open, values read, commits that fail — without
 * reaching into the adapter.
 *
 * Every spy here passes through to the real engine. Tests using them must call
 * `vi.restoreAllMocks()` after each test.
 */

/**
 * Records every connection opened through `factory`.
 *
 * @returns
 * - `firstOpen` resolves with the database name as soon as the first connection starts opening.
 * - `connections()` waits for every open to settle, then lists the connections that are still open.
 */
export function watchConnections(factory: IDBFactory) {
    const requests: IDBOpenDBRequest[] = [];
    let startedOpening: (name: string) => void;
    const firstOpen = new Promise<string>(resolve => startedOpening = resolve);

    const open = factory.open.bind(factory);
    vi.spyOn(factory, 'open').mockImplementation((...args) => {
        const request = open(...args);
        requests.push(request);
        startedOpening(args[0]);
        return request;
    });

    return {
        firstOpen,
        async connections(): Promise<IDBDatabase[]> {
            const opened = await Promise.all(requests.map(settled));
            // Lets the handlers that ran on those events finish (e.g. closing what they just opened).
            await new Promise(resolve => setTimeout(resolve, 0));
            return opened.filter((db): db is IDBDatabase => db !== undefined && !isClosed(db));
        }
    };
}

function settled(request: IDBOpenDBRequest): Promise<IDBDatabase | undefined> {
    if (request.readyState === 'done') return Promise.resolve(request.error ? undefined : request.result);
    return new Promise(resolve => {
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => resolve(undefined));
    });
}

/**
 * Whether a connection is closed (or closing).
 *
 * A transaction with an empty scope is refused either way; the kind of refusal tells the two
 * states apart.
 */
function isClosed(db: IDBDatabase): boolean {
    try {
        db.transaction([]);
        return false;
    } catch (error) {
        return error instanceof Error && error.name === 'InvalidStateError';
    }
}

/**
 * Closes a connection the way the browser does when it must (e.g. its site data is cleared):
 * the connection receives a `close` event.
 */
export function forceClose(db: IDBDatabase): void {
    // Escape hatch: fake-indexeddb declares the parameter as the connection class, not an instance,
    // though at runtime it takes (and needs) the instance. Kept to this one line.
    forceCloseDatabase(db as unknown as typeof IDBDatabase);
}

/**
 * Asks to delete a database, as another tab or a "clear site data" would.
 *
 * @returns `'blocked'` if a connection refuses to close for it, otherwise `'deleted'`.
 */
export function deleteDatabase(factory: IDBFactory, name: string): Promise<'deleted' | 'blocked'> {
    return new Promise((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve('deleted');
        request.onblocked = () => resolve('blocked');
        request.onerror = () => reject(request.error);
    });
}

/**
 * Asks to upgrade a database to a newer version, as a newer build in another tab would.
 *
 * @returns `'upgraded'` (with the connection closed again) if nothing stood in the way,
 * otherwise `'blocked'`.
 */
export function upgradeDatabase(factory: IDBFactory, name: string, version: number): Promise<'upgraded' | 'blocked'> {
    return new Promise((resolve, reject) => {
        const request = factory.open(name, version);
        request.onsuccess = () => {
            request.result.close();
            resolve('upgraded');
        };
        request.onblocked = () => resolve('blocked');
        request.onerror = () => reject(request.error);
    });
}

/**
 * Stores a value straight into an existing database, as another client of it would, with any key
 * IndexedDB accepts (e.g. a number).
 */
export function putDirectly(factory: IDBFactory, name: string, storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = factory.open(name);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(storeName, 'readwrite');
            transaction.objectStore(storeName).put(value, key);
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onabort = () => {
                db.close();
                reject(transaction.error);
            };
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Makes every transaction that writes or deletes `key` abort after its request succeeds — what
 * the browser does when the disk or the origin's quota is full at commit time.
 */
export function failCommitsFor(key: string): void {
    const abortAfterSuccess = (request: IDBRequest) => {
        request.addEventListener('success', () => request.transaction?.abort());
        return request;
    };

    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, target) {
        const request = put.call(this, value, target);
        return target === key ? abortAfterSuccess(request) : request;
    });

    const remove = IDBObjectStore.prototype.delete;
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, target) {
        const request = remove.call(this, target);
        return target === key ? abortAfterSuccess(request) : request;
    });
}

/**
 * Counts every request that can return stored values (as opposed to keys only).
 *
 * @returns A function giving the number of such requests made since the call.
 */
export function countValueReads(): () => number {
    const spies = [
        vi.spyOn(IDBObjectStore.prototype, 'get'),
        vi.spyOn(IDBObjectStore.prototype, 'getAll'),
        vi.spyOn(IDBObjectStore.prototype, 'openCursor'),
        vi.spyOn(IDBIndex.prototype, 'get'),
        vi.spyOn(IDBIndex.prototype, 'getAll'),
        vi.spyOn(IDBIndex.prototype, 'openCursor'),
    ];
    return () => spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
}
