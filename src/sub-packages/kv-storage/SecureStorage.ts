/**
 * Resources:
 *
 * https://www.youtube.com/watch?v=lbt2_M1hZeg
 *
 */

import {type ZodSchema} from "zod"
import type { RawStorage, RawStorageEventMap } from "./types.ts";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";




const { crypto } = globalThis

const u8ToHex = (a: ArrayBufferLike) =>
    Array.from(new Uint8Array(a), (v) => v.toString(16).padStart(2, "0")).join("")

const u8ToBase64 = (a: ArrayBufferLike) =>
    globalThis.btoa(String.fromCharCode.apply(null, [...new Uint8Array(a)]))

const base64ToU8 = (base64: string) =>
    Uint8Array.from(globalThis.atob(base64), (c) => c.charCodeAt(0))

const DEFAULT_ITERATIONS = 147_000
const DEFAULT_SALT_SIZE = 16
const DEFAULT_IV_SIZE = 32
const DEFAULT_NS_SIZE = 8
const DEFAULT_NS_SEPARATOR = "|:|"


export class SecureStorage<T> implements RawStorage<T> {
    #rawStorage:RawStorage;
    #schema?: ZodSchema<T>;
    #unsubscribes:Function[] = []
    events = new TypedCancelableEventEmitter<RawStorageEventMap<T>>();
    
    #encoder = new TextEncoder()
    #decoder = new TextDecoder()

    #keyFx = "PBKDF2"
    #hashAlgo = "SHA-256"
    #cipherMode = "AES-GCM"
    #cipherSize = 256

    protected keyNamespace:Promise<string>
    
    #passwordKey: Promise<CryptoKey>
    
    get #prefixSize() {
        return DEFAULT_SALT_SIZE + DEFAULT_IV_SIZE
    }

    constructor(
        rawStorage:RawStorage,
        password: string,
        schema?: ZodSchema<T>,
        namespace = ""
    ) {
        this.#rawStorage = rawStorage;
        this.#schema = schema;


        const passwordBuffer = this.#encoder.encode(password)
        this.#passwordKey = crypto.subtle.importKey(
            "raw",
            passwordBuffer,
            { name: this.#keyFx },
            false, // Not exportable
            ["deriveKey"]
        )

        this.keyNamespace = new Promise(async resolve => {
            if (!namespace) {
                const hashBuffer = await crypto.subtle.digest(
                    this.#hashAlgo,
                    passwordBuffer
                )
    
                resolve(`${u8ToHex(hashBuffer).slice(-DEFAULT_NS_SIZE)}${DEFAULT_NS_SEPARATOR}`)
            } else {
                resolve(`${namespace}${DEFAULT_NS_SEPARATOR}`)
            }
        })

        this.#unsubscribes.push(this.#rawStorage.events.onCancelable('CHANGE', async (event) => {
            if( event.key.startsWith(await this.keyNamespace) ) {
                // TODO Share this code with .get:
                const boxBase64 = event.newValue;
                if (boxBase64 !== undefined && boxBase64 !== null) {
                    const rawValue = await this.#decrypt(boxBase64)
                    const value = JSON.parse(rawValue);
                    if( this.#schema && !this.#schema.safeParse(value).success ) {
                        return;
                    }
                    this.events.emit('CHANGE', {
                        key: await this.#removeNamespacedKey(event.key),
                        newValue: value
                    })
                }
                
            }
        }))
    }


    get = async (key: string):Promise<T | undefined> => {
        const nsKey = await this.#getNamespacedKey(key)
        const boxBase64 = await this.#rawStorage.get(nsKey)
        if (boxBase64 !== undefined && boxBase64 !== null) {
            const rawValue = await this.#decrypt(boxBase64)
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
            throw new Error(`Cannot set value in secure storage, as value does not match schema. Key: ${key}`);
        }
        const nsKey = await this.#getNamespacedKey(key)
        const jsonValue = JSON.stringify(value)
        const boxBase64 = await this.#encrypt(jsonValue)
        return await this.#rawStorage.set(nsKey, boxBase64)
    }

    remove = async (key: string) => {
        const nsKey = await this.#getNamespacedKey(key)
        return await this.#rawStorage.remove(nsKey)
    }

    getAllKeys = async (): Promise<string[]> => {
        const keyNamespace = await this.keyNamespace;
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


    #getNamespacedKey = async (key: string) => `${await this.keyNamespace}${key}`;
    #removeNamespacedKey = async (nsKey: string) => nsKey.replace(await this.keyNamespace, '');


    /**
     *
     * @param boxBase64 A box contains salt, iv and encrypted data
     * @returns decrypted data
     */
    #decrypt = async (boxBase64: string) => {
        const boxBuffer = base64ToU8(boxBase64)

        const salt = boxBuffer.slice(0, DEFAULT_SALT_SIZE)
        const iv = boxBuffer.slice(DEFAULT_SALT_SIZE, this.#prefixSize)
        const encryptedDataBuffer = boxBuffer.slice(this.#prefixSize)
        const aesKey = await this.#deriveKey(salt, await this.#passwordKey!, ["decrypt"])

        const decryptedDataBuffer = await crypto.subtle.decrypt(
            {
                name: this.#cipherMode,
                iv
            },
            aesKey,
            encryptedDataBuffer
        )
        return this.#decoder.decode(decryptedDataBuffer)
    }

    #encrypt = async (rawData: string) => {
        const salt = crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_SIZE))
        const iv = crypto.getRandomValues(new Uint8Array(DEFAULT_IV_SIZE))
        const aesKey = await this.#deriveKey(salt, await this.#passwordKey!, ["encrypt"])

        const encryptedDataBuffer = new Uint8Array(
            await crypto.subtle.encrypt(
                {
                    name: this.#cipherMode,
                    iv
                },
                aesKey,
                this.#encoder.encode(rawData)
            )
        )

        const boxBuffer = new Uint8Array(
            this.#prefixSize + encryptedDataBuffer.byteLength
        )

        boxBuffer.set(salt, 0)
        boxBuffer.set(iv, DEFAULT_SALT_SIZE)
        boxBuffer.set(encryptedDataBuffer, this.#prefixSize)

        
        const boxBase64 = u8ToBase64(boxBuffer.buffer)
        return boxBase64
    }

    #deriveKey = (
        salt: Uint8Array,
        passwordKey: CryptoKey,
        keyUsage: KeyUsage[]
    ) =>
        crypto.subtle.deriveKey(
            {
                name: this.#keyFx,
                hash: this.#hashAlgo,
                salt,
                iterations: DEFAULT_ITERATIONS
            },
            passwordKey,
            {
                name: this.#cipherMode,
                length: this.#cipherSize
            },
            false,
            keyUsage
        )

    dispose() {
        this.events.removeAllListeners();
        this.#unsubscribes.forEach(x => x());
        this.#unsubscribes = [];
    }
}
