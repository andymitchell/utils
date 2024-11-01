
import {type ZodSchema} from "zod"
import type { RawStorage, RawStorageEventMap } from "./types";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter";



export class TypedStorage<T> implements RawStorage<T> {
    #rawStorage:RawStorage;
    #schema?: ZodSchema<T>;
    #keyNamespace: string;
    #unsubscribes:Function[] = []
    events = new TypedCancelableEventEmitter<RawStorageEventMap<T>>();

    constructor(
        rawStorage:RawStorage,
        schema?: ZodSchema<T>,
        namespace = ""
    ) {
        this.#rawStorage = rawStorage;
        this.#schema = schema;
        this.#keyNamespace = namespace;

        
        this.#unsubscribes.push(this.#rawStorage.events.onCancelable('CHANGE', (event) => {
            if( event.key.startsWith(this.#keyNamespace) ) {
                this.events.emit('CHANGE', {
                    key: this.#removeNamespacedKey(event.key),
                    newValue: JSON.parse(event.newValue) // TODO type check this
                })
            }
        }))
    }


    get = async (key: string):Promise<T | undefined> => {
        const nsKey = await this.#getNamespacedKey(key)
        const rawValue = await this.#rawStorage.get(nsKey)
        if (rawValue !== undefined && rawValue !== null) {
            const value = JSON.parse(rawValue);
            if( this.#schema && !this.#schema.safeParse(value).success ) {
                return undefined;
            }
            return value;
        }
        return undefined
    }

    set = async (key: string, value: T) => {
        if( this.#schema && !this.#schema.safeParse(value).success ) {
            throw new Error(`Cannot set value in typed storage, as value does not match schema. Key: ${key}`);
        }
        const nsKey = await this.#getNamespacedKey(key)
        const jsonValue = JSON.stringify(value);
        return await this.#rawStorage.set(nsKey, jsonValue);
    }

    remove = async (key: string) => {
        const nsKey = await this.#getNamespacedKey(key)
        return await this.#rawStorage.remove(nsKey)
    }

    getAllKeys = async (): Promise<string[]> => {
        const keyNamespace = await this.#keyNamespace;
        const nsKeys = await this.#rawStorage.getAllKeys(keyNamespace);
        return nsKeys.map(nsKey => nsKey.replace(keyNamespace, ''));
    }

    getAll = async (): Promise<Record<string, T>> => {
        const keys = await this.getAllKeys();
        const result: Record<string, T> = {};
        for (const key of keys) {
            const value = await this.get(key);
            if (value !== undefined ) {
                result[key] = value;
            }
        }
        return result;
    }

    dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }


    #getNamespacedKey = (key: string) => `${this.#keyNamespace}${key}`
    #removeNamespacedKey = (nsKey:string) => nsKey.replace(this.#keyNamespace, '');

}
