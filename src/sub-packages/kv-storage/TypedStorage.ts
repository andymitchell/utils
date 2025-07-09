
import {type ZodSchema} from "zod"
import type { IKvStorage, IKvStorageNamespaced, KvRawStorageEventMap } from "./types.ts";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";
import { prettifyZod3ErrorAsJson } from "../prettify-zod-v3-error/index.ts";



export class TypedStorage<T> implements IKvStorageNamespaced<T> {
    #adapter:IKvStorage;
    #schema?: ZodSchema<T>;
    #keyNamespace: string;
    #unsubscribes:Function[] = []
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();

    constructor(
        adapter:IKvStorage,
        schema?: ZodSchema<T>,
        namespace = ""
    ) {
        this.#adapter = adapter;
        this.#schema = schema;
        this.#keyNamespace = namespace;

        
        this.#unsubscribes.push(this.#adapter.events.onCancelable('CHANGE', (event) => {
            if( event.key.startsWith(this.#keyNamespace) ) {
                this.events.emit('CHANGE', {
                    key: this.#removeNamespacedKey(event.key),
                    newValue: event.newValue===undefined? undefined : JSON.parse(event.newValue) // TODO type check this
                })
            }
        }))
    }


    get = async (key: string):Promise<T | undefined> => {
        const nsKey = await this.#getNamespacedKey(key)
        const rawValue = await this.#adapter.get(nsKey)
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
        if( this.#schema ) {
            const result = this.#schema.safeParse(value);
            if( !result.success ) {
                const schemaFailSummary = prettifyZod3ErrorAsJson(result.error);
                throw new Error(`Cannot set value in typed storage, as value does not match schema. Key: ${key}`, {cause: {schemaFailSummary}});
            }
        }
        const nsKey = await this.#getNamespacedKey(key)
        const jsonValue = JSON.stringify(value);
        return await this.#adapter.set(nsKey, jsonValue);
    }

    remove = async (key: string) => {
        const nsKey = await this.#getNamespacedKey(key)
        return await this.#adapter.remove(nsKey)
    }

    getAllKeys = async (): Promise<string[]> => {
        const keyNamespace = await this.#keyNamespace;
        const nsKeys = await this.#adapter.getAllKeys(keyNamespace);
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

    async dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }


    #getNamespacedKey = (key: string) => `${this.#keyNamespace}${key}`
    #removeNamespacedKey = (nsKey:string) => nsKey.replace(this.#keyNamespace, '');

}
