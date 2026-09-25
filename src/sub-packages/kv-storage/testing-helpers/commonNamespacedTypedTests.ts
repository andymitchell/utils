import { onTestFinished } from "vitest";
import { z } from "zod";
import { promiseWithTrigger, sleep } from "../../../index-browser.ts";
import { MemoryStorage } from "../adapters/MemoryStorage.ts";
import type { IKvStorage, IKvStorageNamespaced } from "../types.ts";
import type { TypedStorage } from "../TypedStorage.ts";
import { GatedStorage } from "./GatedStorage.ts";

/**
 * Hang guard for tests whose failure mode is an event that never arrives: they fail fast
 * instead of waiting for the default timeout.
 */
const HANG_GUARD_MS = 2000;

type ChangeEvent = { key: string, newValue?: unknown };

/** Resolves with the next `CHANGE` the store emits for `key`. */
function nextChangeTo(store: IKvStorageNamespaced, key: string): Promise<ChangeEvent> {
    return new Promise(resolve => {
        const cancel = store.events.onCancelable('CHANGE', event => {
            if (event.key !== key) return;
            cancel();
            resolve(event);
        });
    });
}

/** Sets `key`, resolving once the store has announced the change (some stores announce asynchronously). */
async function setAndHear(store: IKvStorageNamespaced, key: string, value: unknown): Promise<void> {
    const heard = nextChangeTo(store, key);
    await store.set(key, value);
    await heard;
}

/** Collects every promise rejection nothing handles, until the current test finishes. */
function recordUnhandledRejections(): unknown[] {
    const reasons: unknown[] = [];
    const record = (reason: unknown) => reasons.push(reason);
    process.on('unhandledRejection', record);
    onTestFinished(() => { process.off('unhandledRejection', record) });
    return reasons;
}

/** A namespaced store that can also read every value at once, as the typed stores can. */
type TypedStore = IKvStorageNamespaced & Pick<TypedStorage<unknown>, 'getAll'>;

export function commonNamespacedTypedTests(generator: (namespace?:string, adapter?:IKvStorage, schema?: z.ZodType<any>) => TypedStore, options?: {include_schema?: boolean}) {
    test('basic', async () => {
        
        const val = 'val1';
        const rawStorage = new MemoryStorage();
        const store = generator(undefined, rawStorage);

        await store.set('key1', val);

        expect(await store.get('key1')).toBe(val);
        
        const rawKeys = await rawStorage.getAllKeys();
        expect(rawKeys[0]===undefined || !rawKeys[0]).toBe(false);
        expect(await rawStorage.get(rawKeys[0]!)===val).toBe(false);
        
    })

    test('listeners', async () => {
        
        const rawStorage = new MemoryStorage();
        const store = generator('ns1', rawStorage);

        // Generous timeout: it's a hang-guard only — the assertion is that the event arrives.
        const pwt = promiseWithTrigger<void>(10_000);

        let changeOk = false;
        store.events.on('CHANGE', event => {
            changeOk = event.key==='key1' && event.newValue==='val1';
            pwt.trigger();
        })

        await store.set('key1', 'val1');
        await pwt.promise; // Decryption is slow. 
        

        expect(changeOk).toBe(true);

    });

    describe('change events tell listeners what get would return', () => {

        test('a removed key is announced with no value', async () => {
            const store = generator('ns1', new MemoryStorage());
            await setAndHear(store, 'key1', 'val1');

            const told = nextChangeTo(store, 'key1');
            await store.remove('key1');

            expect(await told).toEqual({ key: 'key1', newValue: undefined });
            expect(await store.get('key1')).toBeUndefined();
        }, HANG_GUARD_MS);

        if (options?.include_schema) {
            test('a changed value that fails the schema is announced with no value', async () => {
                const rawStorage = new MemoryStorage();
                const store = generator('ns1', rawStorage, z.object({ name: z.string() }));
                const schemalessWriter = generator('ns1', rawStorage);

                const told = nextChangeTo(store, 'key1');
                await schemalessWriter.set('key1', { age: 2 });

                expect(await told).toEqual({ key: 'key1', newValue: undefined });
                expect(await store.get('key1')).toBeUndefined();
            }, HANG_GUARD_MS);
        }

        test('a stored value that cannot be read neither fails the write that stored it nor reaches a listener', async () => {
            const rawStorage = new MemoryStorage();
            const store = generator('ns1', rawStorage);
            await setAndHear(store, 'unreadable', 'val1');
            const [rawKey] = await rawStorage.getAllKeys();
            const heard: string[] = [];
            store.events.on('CHANGE', event => heard.push(event.key));
            const unhandled = recordUnhandledRejections();

            await expect(rawStorage.set(rawKey!, 'not json')).resolves.toBeUndefined();
            // Gives the store time to deal with the unreadable value: a readable one written after it is heard first.
            await setAndHear(store, 'readable', 'val2');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(heard).toEqual(['readable']);
            expect(unhandled).toEqual([]);
            await expect(store.get('unreadable')).rejects.toThrow();
        }, HANG_GUARD_MS);
    });


    describe('reading every value', () => {

        test('starts every read before any of them finishes', async () => {
            const adapter = new GatedStorage();
            const store = generator('ns1', adapter);
            const keys = ['a', 'b', 'c', 'd', 'e'];
            for (const key of keys) await store.set(key, `value of ${key}`);

            const reading = store.getAll();
            await new Promise(resolve => setTimeout(resolve, 0));
            const readsStarted = adapter.pendingReads();
            adapter.release();

            expect(readsStarted).toBe(keys.length);
            expect(await reading).toEqual(Object.fromEntries(keys.map(key => [key, `value of ${key}`])));
        });

        if (options?.include_schema) {
            test('agrees with get for every key, leaving out values that fail the schema', async () => {
                const rawStorage = new MemoryStorage();
                const store = generator('ns1', rawStorage, z.object({ name: z.string() }));
                const schemalessWriter = generator('ns1', rawStorage);
                const written: Record<string, unknown> = {
                    valid1: { name: 'Ada' }, invalid1: { age: 2 }, valid2: { name: 'Bob' }, invalid2: 'text', removed: { name: 'Cy' }
                };
                for (const [key, value] of Object.entries(written)) await schemalessWriter.set(key, value);
                await store.remove('removed');

                const all = await store.getAll();

                const keys = await store.getAllKeys();
                for (const key of keys) expect(all[key]).toEqual(await store.get(key));
                expect(Object.keys(all).sort()).toEqual(['valid1', 'valid2']);
            });
        }
    });

    test('namespace check', async () => {
        
        const rawStorage = new MemoryStorage();
        const store = generator('ns1', rawStorage);

        const val = 'bob';
        await store.set('key1', val);
        expect(await store.get('key1')).toEqual(val);
        

        // Another namespace cannot access it
        const store2 = generator('ns2', rawStorage);
        expect(await store2.get('key1')).toBe(undefined);

        // Make sure keys work as expected
        await store2.set('key2', val);
        expect(await store.getAllKeys()).toEqual(['key1']);

    });


    if( options?.include_schema ) {

        test('schema check', async () => {
            
            
            const rawStorage = new MemoryStorage(); 
            const schema = z.object({
                name: z.string()
            })
            const schema2 = z.object({
                location: z.string()
            })
            const store = generator(undefined, rawStorage, schema);

            const val = {
                name: 'Bob'
            };

            await store.set('key1', val);
            expect(await store.get('key1')).toEqual(val);
            
            // Expect it to fail to write the wrong schema'd object
            let error = false;
            try {
                // @ts-ignore - force a wrong shape
                await store.set('key2', {age: 2});
            } catch(e) {
                error = true;
            }
            expect(error).toBe(true);
            expect(await store.get('key2')).toBe(undefined);

            // And it protects reading against a different schema
            const schema2Store = generator(undefined, rawStorage, schema2);
            expect(await schema2Store.get('key1')).toEqual(undefined);
            
        })
    }
}
