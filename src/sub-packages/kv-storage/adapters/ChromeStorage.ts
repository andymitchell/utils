
import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { IKvStorage, KvRawStorageEventMap } from "../types.ts";

export class ChromeStorage implements IKvStorage {

    #storage:chrome.storage.StorageArea;
    #unsubscribes:Function[] = [];
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap>()

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

        if( typeof chrome!=='undefined' ) { 
            const lastErrorMessage = chrome?.runtime.lastError?.message;
            if( lastErrorMessage?.toLowerCase().includes("quota") ) {
                const bytesInUse = await this.#storage.getBytesInUse();
                throw new Error(`Could not write due to exceeding quota. Bytes in use: ${bytesInUse}. lastError: ${lastErrorMessage}`);
            }
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

