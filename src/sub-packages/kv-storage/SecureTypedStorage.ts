import { type ZodType } from "zod"
import type { IKvStorage, IKvStorageNamespaced, KvChangeEvent, KvRawStorageEventMap } from "./types.ts";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";
import { prettifyZodErrorAsJson } from "../prettify-zod-error/prettifyZodError.ts";
import { createSecretBox, type SecretBox } from "./secretBox.ts";
import { decodeTypedValue, readAll } from "./typedValues.ts";
import { inOrder } from "./inOrder.ts";

const NS_HASH_CHARS = 8
const NS_SEPARATOR = "|:|"

/**
 * A typed key-value store that encrypts every value with a password before handing it to an
 * underlying adapter (e.g. `ChromeStorage`, `IdbStorage`).
 *
 * Values are JSON-encoded, then encrypted with AES-GCM. Keys stay readable, prefixed with a
 * namespace so several stores can share one adapter. Stores with the same password and namespace
 * over the same adapter share the same data.
 *
 * @example
 * const secrets = new SecureTypedStorage(new ChromeStorage(), password, z.object({ token: z.string() }), 'auth');
 * secrets.events.on('CHANGE', ({ key, newValue }) => console.log(key, newValue));
 * await secrets.set('session', { token: 'abc' });
 * await secrets.get('session'); // { token: 'abc' }
 *
 * @remarks
 * The key is derived from the password once per store, which is deliberately slow (tens of
 * milliseconds, more on phones); after that, reads, writes and change events cost one AES
 * operation each. Values written by another store cost one extra derivation for that writer.
 *
 * `CHANGE` carries what `get` would return: `undefined` for a removed key or a value that fails
 * the schema. A value `get` would reject (another password, not JSON, or one the schema throws
 * on) announces nothing. Changes are announced in the order they were made, so a value from a
 * writer the store has not met before holds back the announcements after it for one derivation.
 */
export class SecureTypedStorage<T> implements IKvStorageNamespaced<T> {
    #adapter:IKvStorage;
    #schema?: ZodType<T>;
    #box: SecretBox;
    #unsubscribes:Function[] = []
    events = new TypedCancelableEventEmitter<KvRawStorageEventMap<T>>();

    /** The prefix every key has in the adapter, including the separator. */
    protected keyNamespace:Promise<string>

    /**
     * @param adapter Where the encrypted values are kept.
     * @param password Encrypts every value. Stores need the same password to read each other's values.
     * @param schema When given, `set` rejects values that fail it, and `get` returns `undefined` for them.
     * @param namespace Prefixes every key in the adapter. Defaults to one derived from the password.
     */
    constructor(
        adapter:IKvStorage,
        password: string,
        schema?: ZodType<T>,
        namespace = ""
    ) {
        this.#adapter = adapter;
        this.#schema = schema;
        this.#box = createSecretBox(password);
        this.keyNamespace = namespace ? Promise.resolve(`${namespace}${NS_SEPARATOR}`) : namespaceFromPassword(password);

        this.#unsubscribes.push(this.#adapter.events.onCancelable('CHANGE', event => this.#announceInOrder(this.#readChange(event))))
    }

    /**
     * Emits each change worth announcing. Decrypting takes time, so changes are emitted in the
     * order the adapter reported them, or a quick one (a removal) could overtake an earlier one.
     */
    #announceInOrder = inOrder<KvChangeEvent<T> | undefined>(change => {
        if (change) this.events.emit('CHANGE', change);
    });

    /**
     * What to announce for a change the adapter reports: nothing outside this store's namespace or
     * with no one listening, otherwise the key and what `get` would return.
     *
     * Rejects for a value `get` rejects too (another password, not JSON, or the schema throws on
     * it): there is no value to report, and the write that stored it has already succeeded, so the
     * change is not announced.
     */
    async #readChange({ key: nsKey, newValue: stored }: KvChangeEvent<string>): Promise<KvChangeEvent<T> | undefined> {
        const keyNamespace = await this.keyNamespace;
        if (!nsKey.startsWith(keyNamespace) || this.events.listenerCount('CHANGE') === 0) return undefined;
        return { key: nsKey.slice(keyNamespace.length), newValue: await this.#decode(stored) };
    }

    /** Decrypts and decodes a value as stored in the adapter; rejects if it cannot be read. */
    async #decode(stored: string | undefined | null): Promise<T | undefined> {
        if (stored === undefined || stored === null) return undefined;
        const decoded = decodeTypedValue(await this.#box.open(stored), this.#schema);
        if (!decoded.ok) throw decoded.error;
        return decoded.value;
    }

    /**
     * @returns The value under `key`, or `undefined` if there is none or it fails the schema.
     * Rejects if the stored value cannot be decrypted with this password, is not JSON, or the
     * schema throws on it.
     */
    get = async (key: string):Promise<T | undefined> => {
        return await this.#decode(await this.#adapter.get(await this.#getNamespacedKey(key)));
    }

    /**
     * Encrypts and stores `value` under `key`.
     *
     * @returns Resolves once the adapter has stored it. Rejects, storing nothing, if `value`
     * fails the schema; the error's `cause.schemaFailSummary` lists each failing field's path.
     */
    set = async (key: string, value: T) => {
        if( this.#schema ) {
            const result = this.#schema.safeParse(value);
            if( !result.success ) {
                const schemaFailSummary = prettifyZodErrorAsJson(result.error);
                throw new Error(`Cannot set value in secure storage, as value does not match schema. Key: ${key}`, {cause: {schemaFailSummary}});
            }
        }
        const nsKey = await this.#getNamespacedKey(key)
        const sealed = await this.#box.seal(JSON.stringify(value))
        return await this.#adapter.set(nsKey, sealed)
    }

    /** Deletes `key`. */
    remove = async (key: string) => {
        const nsKey = await this.#getNamespacedKey(key)
        return await this.#adapter.remove(nsKey)
    }

    /** @returns Every key in this store's namespace, without the namespace prefix. */
    getAllKeys = async (): Promise<string[]> => {
        const keyNamespace = await this.keyNamespace;
        const nsKeys = await this.#adapter.getAllKeys(keyNamespace);
        return nsKeys.map(nsKey => nsKey.replace(keyNamespace, ''));
    }

    /**
     * Reads every value in this store's namespace at once, rather than one after another.
     *
     * @returns Every key in the namespace with its value, leaving out keys whose value fails the
     * schema. Rejects if any value cannot be read, as `get` does.
     */
    getAll = async (): Promise<Record<string, T>> => {
        return await readAll(await this.getAllKeys(), this.get);
    }


    #getNamespacedKey = async (key: string) => `${await this.keyNamespace}${key}`;

    /** Stops listening to the adapter and removes every listener. The adapter is left open. */
    async dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }
}

/** A namespace unique to the password, so stores with different passwords don't collide. */
async function namespaceFromPassword(password: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(-NS_HASH_CHARS)}${NS_SEPARATOR}`;
}
