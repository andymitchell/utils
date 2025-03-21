
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";
import type { IRawStorage, RawStorageEventMap } from "./types.ts";

export class ChromeStorage implements IRawStorage {

    #storage:chrome.storage.StorageArea;
    #unsubscribes:Function[] = [];
    events = new TypedCancelableEventEmitter<RawStorageEventMap>()

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

    async set(key: string, value: string): Promise<void> {
        
        
        await this.#storage.set({ [key]: value })

    }
    async get(key: string): Promise<string | undefined> {
        
        const dataMap = await this.#storage.get(key)
        return dataMap[key]
    }
    async remove(key: string): Promise<void> {
        
        await this.#storage.remove(key)
    }

    async getAllKeys(keyNamespace?:string):Promise<string[]> {
        
        
        const all = await this.#storage.get(null);
        let keys = Object.keys(all);
        if( keyNamespace ) keys = keys.filter(x => x.startsWith(keyNamespace));
        return keys;
    }

    dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }

}

