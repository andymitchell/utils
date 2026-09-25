import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";

/**
 * A key-value store that forwards every call to a store chosen asynchronously, such as one picked
 * from user preferences, the environment or a feature flag once it has loaded.
 *
 * Calls made before the store is chosen wait for it, and `CHANGE` events from the chosen store
 * are re-emitted on this one.
 *
 * @example
 * const storage = new DeferredKvStorage(async () =>
 *     (await loadSettings()).persist ? new IdbStorage('app') : new MemoryStorage()
 * );
 * await storage.set('key1', 'val1'); // waits for the pick, then writes to the chosen store
 *
 * @remarks
 * If the picker rejects or throws, every call rejects with its error, now and later; the picker
 * is not retried. A failed pick raises no unhandled rejection of its own, and `dispose()` still
 * succeeds.
 */
export class DeferredKvStorage implements IKvStorage<string> {
    
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<string>>();

    #store:Promise<IKvStorage>;

    /**
     * @param storePicker Chooses the store. It runs at once; its result, or the error it throws or
     * rejects with, is what every call receives.
     */
    constructor(storePicker:() => Promise<IKvStorage>) {
        // Runs the picker at once, turning a throw into a rejection like any other failed pick.
        this.#store = new Promise(resolve => resolve(storePicker()));

        this.#store.then(store => {
            store.events.addListener('CHANGE', (event) => {
                this.events.emit('CHANGE', event);
            })
        }, () => {
            // A failed pick is reported to every call instead, as each one awaits the store.
        })
    }

    async set(key: string, value: string): Promise<void> {
        const store = await this.#store;
        return store.set(key, value);
        
    }

    async get(key: string): Promise<string | undefined> {
        const store = await this.#store;
        return store.get(key);
    }

    async remove(key: string): Promise<void> {
        const store = await this.#store;
        return store.remove(key);
    }

    async getAllKeys(keyNamespace?: string): Promise<string[]> {
        const store = await this.#store;
        return store.getAllKeys(keyNamespace);
    }

    /**
     * Removes every listener and disposes the chosen store, waiting for the pick if it is still
     * running. Resolves even when the pick failed, as there is no store to dispose.
     */
    async dispose(): Promise<void>{
        this.events.removeAllListeners();

        const store = await this.#store.catch(() => undefined);
        await store?.dispose();
    }
}
