import { sleep } from "../../main";
import { ChromeStorage } from "./ChromeStorage"
import { SecureStorage } from "./SecureStorage"
import { MockChromeStorageArea } from "./testing-helpers/MockChromeStorageArea"
import * as z from 'zod';


describe('SecureStorage', () => {


    test('basic', async () => {
        
        const val = 'val1';
        const rawStorage = new ChromeStorage(new MockChromeStorageArea())
        const store = new SecureStorage(rawStorage, '123');

        await store.set('key1', val);

        expect(await store.get('key1')).toBe(val);
        
        const rawKeys = await rawStorage.getAllKeys();
        expect(rawKeys[0]===undefined || !rawKeys[0]).toBe(false);
        expect(await rawStorage.get(rawKeys[0]!)===val).toBe(false);
        
    })

    test('schema check', async () => {
        
        
        const rawStorage = new ChromeStorage(new MockChromeStorageArea())
        const schema = z.object({
            name: z.string()
        })
        const schema2 = z.object({
            location: z.string()
        })
        const store = new SecureStorage(rawStorage, '123', schema);

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
        const schema2Store = new SecureStorage(rawStorage, '123', schema2);
        expect(await schema2Store.get('key1')).toEqual(undefined);
        
    })

    test('namespace check', async () => {
        
        const rawStorage = new ChromeStorage(new MockChromeStorageArea())
        const store = new SecureStorage(rawStorage, '123', undefined, 'ns1');

        const val = 'bob';
        await store.set('key1', val);
        expect(await store.get('key1')).toEqual(val);
        

        // Another namespace cannot access it
        const store2 = new SecureStorage(rawStorage, '123', undefined, 'ns2');
        expect(await store2.get('key1')).toBe(undefined);

        // Make sure keys work as expected
        await store2.set('key2', val);
        expect(await store.getAllKeys()).toEqual(['key1']);

    });


    test('listeners', async () => {
        
        const rawStorage = new ChromeStorage(new MockChromeStorageArea())
        const store = new SecureStorage(rawStorage, '123', undefined, 'ns1');

        
        let changeOk = false;
        store.events.on('CHANGE', event => {
            changeOk = event.key==='key1' && event.newValue==='val1';
        })

        await store.set('key1', 'val1');
        await sleep(500); // Decryption is slow. TODO Better way to test with a helper function that waits for the expected outcome? 

        expect(changeOk).toBe(true);

    });

})