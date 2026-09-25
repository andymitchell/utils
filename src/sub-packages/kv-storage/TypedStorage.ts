
import { type ZodType } from "zod"
import type { IKvStorage, IKvStorageNamespaced, KvRawStorageEventMap } from "./types.ts";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";
import { prettifyZodErrorAsJson } from "../prettify-zod-error/index.ts";
import { decodeTypedValue, readAll, type DecodedValue } from "./typedValues.ts";


/**
 * A typed key-value store over an underlying adapter (e.g. `ChromeStorage`, `IdbStorage`),
 * keeping values as JSON.
 *
 * Keys are prefixed with a namespace so several stores can share one adapter; stores with the
 * same namespace over the same adapter share the same data.
 *
 * @example
 * const settings = new TypedStorage(new ChromeStorage(), z.object({ theme: z.string() }), 'settings');
 * settings.events.on('CHANGE', ({ key, newValue }) => console.log(key, newValue));
 * await settings.set('ui', { theme: 'dark' });
 * await settings.get('ui'); // { theme: 'dark' }
 *
 * @remarks
 * `CHANGE` carries what `get` would return: `undefined` for a removed key or a value that fails
 * the schema. A value that is not JSON (which `get` rejects) announces nothing.
 */
export class TypedStorage<T> implements IKvStorageNamespaced<T> {
    #adapter:IKvStorage;
    #schema?: ZodType<T>;
    #keyNamespace: string;
    #unsubscribes:Function[] = []
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();

    /**
     * @param adapter Where the JSON-encoded values are kept.
     * @param schema When given, `set` rejects values that fail it, and `get` returns `undefined` for them.
     * @param namespace Prefixes every key in the adapter. Defaults to none: the store sees every key.
     */
    constructor(
        adapter:IKvStorage,
        schema?: ZodType<T>,
        namespace = ""
    ) {
        this.#adapter = adapter;
        this.#schema = schema;
        this.#keyNamespace = namespace;

        
        this.#unsubscribes.push(this.#adapter.events.onCancelable('CHANGE', event => this.#announce(event)))
    }

    /** Emits `CHANGE` for a change the adapter reports in this store's namespace. */
    #announce({ key: nsKey, newValue: stored }: { key: string, newValue?: string }) {
        if (!nsKey.startsWith(this.#keyNamespace) || this.events.listenerCount('CHANGE') === 0) return;
        const decoded = this.#decode(stored);
        // `get` rejects a value that is not JSON too: there is no value to report, and the write that
        // stored it has already succeeded (and must not fail for it), so the change is not announced.
        if (!decoded.ok) return;
        this.events.emit('CHANGE', { key: this.#removeNamespacedKey(nsKey), newValue: decoded.value });
    }

    #decode(stored: string | undefined | null): DecodedValue<T> {
        if (stored === undefined || stored === null) return { ok: true, value: undefined };
        return decodeTypedValue(stored, this.#schema);
    }

    /**
     * @returns The value under `key`, or `undefined` if there is none or it fails the schema.
     * Rejects if the stored value is not JSON.
     */
    get = async (key: string):Promise<T | undefined> => {
        const decoded = this.#decode(await this.#adapter.get(this.#getNamespacedKey(key)));
        if (!decoded.ok) throw decoded.error;
        return decoded.value;
    }

    /**
     * JSON-encodes and stores `value` under `key`.
     *
     * @returns Resolves once the adapter has stored it. Rejects, storing nothing, if `value`
     * fails the schema; the error's `cause.schemaFailSummary` lists each failing field's path.
     */
    set = async (key: string, value: T) => {
        if( this.#schema ) {
            const result = this.#schema.safeParse(value);
            if( !result.success ) {
                const schemaFailSummary = prettifyZodErrorAsJson(result.error);
                throw new Error(`Cannot set value in typed storage, as value does not match schema. Key: ${key}`, {cause: {schemaFailSummary}});
            }
        }
        const nsKey = this.#getNamespacedKey(key)
        const jsonValue = JSON.stringify(value);
        return await this.#adapter.set(nsKey, jsonValue);
    }

    /** Deletes `key`. */
    remove = async (key: string) => {
        const nsKey = this.#getNamespacedKey(key)
        return await this.#adapter.remove(nsKey)
    }

    /** @returns Every key in this store's namespace, without the namespace prefix. */
    getAllKeys = async (): Promise<string[]> => {
        const nsKeys = await this.#adapter.getAllKeys(this.#keyNamespace);
        return nsKeys.map(this.#removeNamespacedKey);
    }

    /**
     * Reads every value in this store's namespace at once, rather than one after another.
     *
     * @returns Every key in the namespace with its value, leaving out keys whose value fails the
     * schema. Rejects if any value is not JSON, as `get` does.
     */
    getAll = async (): Promise<Record<string, T>> => {
        return await readAll(await this.getAllKeys(), this.get);
    }

    /** Stops listening to the adapter and removes every listener. The adapter is left open. */
    async dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }


    #getNamespacedKey = (key: string) => `${this.#keyNamespace}${key}`
    #removeNamespacedKey = (nsKey:string) => nsKey.replace(this.#keyNamespace, '');

}
