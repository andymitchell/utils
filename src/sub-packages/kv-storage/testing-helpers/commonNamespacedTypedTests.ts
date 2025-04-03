import { z, type ZodSchema } from "zod";
import { promiseWithTrigger, sleep } from "../../../index-browser.ts";
import { MemoryStorage } from "../adapters/MemoryStorage.ts";
import type { IKvStorage, IKvStorageNamespaced } from "../types.ts";

export function commonNamespacedTypedTests(generator: (namespace?:string, adapter?:IKvStorage, schema?: ZodSchema<any>) => IKvStorageNamespaced, options?: {include_schema?: boolean}) {
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

        const pwt = promiseWithTrigger<void>(500);

        let changeOk = false;
        store.events.on('CHANGE', event => {
            changeOk = event.key==='key1' && event.newValue==='val1';
            pwt.trigger();
        })

        await store.set('key1', 'val1');
        await pwt.promise; // Decryption is slow. 
        

        expect(changeOk).toBe(true);

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
