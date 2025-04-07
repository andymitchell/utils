import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";

/**
 * A key-value storage wrapper that picks the actual storage backend asynchronously 
 * before any commands are executed.
 * 
 * Useful when the storage backend depends on runtime conditions, such as:
 * - Fetching user preferences to decide between memory, indexed db, chrome storage, etc.
 * - Selecting a different store based on environment (e.g. dev vs prod)
 * - Delaying storage selection until a feature flag or config is loaded
 * 
 * All standard KV operations (`get`, `set`, etc.) are forwarded once the underlying store is chosen.
 */
export class DeferredKvStorage implements IKvStorage<string> {
    
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<string>>();

    #store:Promise<IKvStorage>;

    constructor(storePicker:() => Promise<IKvStorage>) {
        this.#store = storePicker();

        this.#store.then(store => {
            store.events.addListener('CHANGE', (event) => {
                this.events.emit('CHANGE', event);
            })
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

    async dispose(): Promise<void>{
        this.events.removeAllListeners();

        const store = await this.#store;
        return await store.dispose();

    }
}
