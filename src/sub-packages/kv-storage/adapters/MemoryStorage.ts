import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";


export class MemoryStorage implements IKvStorage<string> {
    #store = new Map<string, string>();
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<string>>();

    async set(key: string, value: string): Promise<void> {
        this.#store.set(key, value);
        this.events.emit('CHANGE', { key, newValue: value });
    }

    async get(key: string): Promise<string | undefined> {
        return this.#store.get(key);
    }

    async remove(key: string): Promise<void> {
        this.#store.delete(key);
        this.events.emit('CHANGE', { key, newValue: undefined });
    }

    async getAllKeys(keyNamespace?: string): Promise<string[]> {
        let keys = Array.from(this.#store.keys());
        if (keyNamespace) {
            keys = keys.filter(k => k.startsWith(keyNamespace));
        }
        return keys;
    }

    dispose(): void {
        this.events.removeAllListeners();
        this.#store.clear();
    }
}
