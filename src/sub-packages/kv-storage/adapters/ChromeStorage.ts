
import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";

/**
 * A key-value store kept in a Chrome extension storage area, `chrome.storage.local` unless
 * another is given.
 *
 * `CHANGE` is emitted for every change to the area, including those made by other parts of the
 * extension (popup, service worker, other tabs).
 *
 * @example
 * const storage = new ChromeStorage(chrome.storage.session);
 * await storage.set('key1', 'val1');
 */
export class ChromeStorage implements IKvStorage {

    #storage:chrome.storage.StorageArea;
    #unsubscribes:Function[] = [];
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap>()

    /**
     * @param storage The area to keep values in. Only the default reads the `chrome` global, so
     * any area (e.g. a `MockChromeStorageArea` in tests) works where there is none.
     */
    constructor(storage:chrome.storage.StorageArea = chrome.storage.local) {
        this.#storage = storage;

        const handleStorageChange = (changes:{[key: string]: chrome.storage.StorageChange}) => {
            for(const key in changes) {
                this.events.emit('CHANGE', {key, newValue: changes[key]!.newValue})
            }
        };
        storage.onChanged.addListener(handleStorageChange);
        this.#unsubscribes.push(() => {
            storage.onChanged.removeListener(handleStorageChange);
        })
    }

    /**
     * Stores `value` under `key`.
     *
     * @returns Resolves once the storage area has stored it. Rejects if the area refuses the
     * write, leaving the previous value in place. A write refused for quota rejects with an error
     * named `QuotaExceededError` (as IndexedDB names one), reporting the bytes in use where the
     * area can count them, with the browser's own error as its `cause`.
     */
    async set(key: string, value: string): Promise<void> {
        try {
            await this.#storage.set({ [key]: value });
        } catch (error) {
            throw isQuotaError(error) ? await this.#quotaExceeded(error) : error;
        }
    }

    /** Describes a write refused for quota, with the bytes in use where the area can count them. */
    async #quotaExceeded(cause: Error): Promise<Error> {
        const bytesInUse = await this.#bytesInUse();
        const inUse = bytesInUse === undefined ? '' : ` (${bytesInUse} bytes in use)`;
        const error = new Error(`The storage area is full${inUse}: ${cause.message}`, { cause });
        error.name = 'QuotaExceededError';
        return error;
    }

    async #bytesInUse(): Promise<number | undefined> {
        // Not every browser's storage areas can count their bytes; the error is still worth reporting without it.
        if (typeof this.#storage.getBytesInUse !== 'function') return undefined;
        try {
            return await this.#storage.getBytesInUse(null);
        } catch {
            return undefined;
        }
    }
    async get(key: string): Promise<string | undefined> {
        
        // Named explicitly, because a storage area makes no promise about what it holds and
        // this adapter only ever writes strings into it.
        const dataMap = await this.#storage.get<Record<string, string>>(key)
        return dataMap[key]
    }
    async remove(key: string): Promise<void> {
        
        await this.#storage.remove(key)
    }

    /**
     * Lists the stored keys.
     *
     * @param keyNamespace When given, only keys starting with it are listed.
     *
     * @remarks
     * Where the browser can list keys on their own (Chrome 130+), no values are read. Elsewhere
     * the whole storage area is read to find its keys.
     */
    async getAllKeys(keyNamespace?:string):Promise<string[]> {
        const keys = typeof this.#storage.getKeys === 'function'
            ? await this.#storage.getKeys()
            : Object.keys(await this.#storage.get(null));
        return keys.filter(key => !keyNamespace || key.startsWith(keyNamespace));
    }

    async dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }

}

/** Whether a write was refused for quota: browsers name the quota in the message (e.g. "QUOTA_BYTES quota exceeded"). */
function isQuotaError(error: unknown): error is Error {
    return error instanceof Error && /quota/i.test(error.message);
}

