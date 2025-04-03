import type { IKvStorage } from "../types.ts"

export function commonAdapterTests(generator:() => IKvStorage) {
    
    
    
    describe('Core', () => {
    
    
        test('basic', async () => {
            const store = generator();
    
            await store.set('ns1.key1', 'val1');
            await store.set('ns2.key2', 'val2');
    
            expect(await store.get('ns1.key1')).toBe('val1');
            expect(await store.getAllKeys()).toEqual(['ns1.key1', 'ns2.key2']);
            expect(await store.getAllKeys('ns1')).toEqual(['ns1.key1']);
        })
    
        test('listeners', async () => {
            const store = generator();
    
            
            let changeOk = false;
            store.events.on('CHANGE', event => {
                changeOk = event.key==='key1' && event.newValue==='val1';
            })
    
            await store.set('key1', 'val1');
    
            expect(changeOk).toBe(true);
    
        });
    
    })
}