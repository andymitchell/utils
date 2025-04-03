import { promiseWithTrigger } from "../../../index-browser.ts";
import type { IKvStorage } from "../types.ts"

export function commonAdapterTests(
    generator:(adapter?:IKvStorage) => IKvStorage,
    /**
     * It'll run tests designed to see if data syncs between multiple raw stores
     */
    generatorForTwoStoresSharingData?: () => {store1: IKvStorage, store2: IKvStorage},
    /**
     * It'll run tests to check that even though the store is shared, because they use different keys/accessors, they won't access each other's data
     */
    generatorForTwoStoresSharingDataButMultiTenant?: () => Array<{name: string, generator: () => {store1: IKvStorage, store2: IKvStorage}}>
) {
    
    
    
    describe('Core', () => {
    
    
        test('read write', async () => {
            const store = generator();
    
            await store.set('ns1.key1', 'val1');
            await store.set('ns2.key2', 'val2');
    
            expect(await store.get('ns1.key1')).toBe('val1');
            expect(await store.getAllKeys()).toEqual(['ns1.key1', 'ns2.key2']);
            expect(await store.getAllKeys('ns1')).toEqual(['ns1.key1']);
        })

        test('read an unknown key should be undefined', async () => {
            const store = generator();
    
    
            expect(await store.get('ns1.unknownKey')).toBe(undefined);
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

    if( generatorForTwoStoresSharingData ) {
        describe('Shared Adapter Data', () => {
            test('basic', async () => {
                const {store1, store2} = generatorForTwoStoresSharingData();
        
                await store1.set('ns1.key1', 'val1');
        
                expect(await store2.get('ns1.key1')).toBe('val1');
                expect(await store2.getAllKeys()).toEqual(['ns1.key1']);
            })
        
            test('listeners', async () => {
                const {store1, store2} = generatorForTwoStoresSharingData();
        
                const pwt = promiseWithTrigger<void>(300);
                
                let changeOk = false;
                store2.events.on('CHANGE', event => {
                    changeOk = event.key==='key1' && event.newValue==='val1';
                    if( changeOk ) {
                        pwt.trigger();
                    }
                })
        
                store1.set('key1', 'val1');

                await pwt.promise;
        
                expect(changeOk).toBe(true);
        
            });
        })
    }

    if( generatorForTwoStoresSharingDataButMultiTenant ) {
        describe('Shared Adapter Data, but isolated for multi-tenant', () => {

            const storagePairGeneratorss = generatorForTwoStoresSharingDataButMultiTenant();
            storagePairGeneratorss.forEach((storagePairGenerator, index) => {
                describe(`Storage Pair ${index+1} [${storagePairGenerator.name}]`, () => {
                    test('cannot read each others data', async () => {
                        const {store1, store2} = storagePairGenerator.generator();
                
                        await store1.set('ns1.key1', 'val1');
                
                        expect(await store2.get('ns1.key1')).toBe(undefined);
                        //expect(await store2.getAllKeys()).toEqual([]);
                    })
                
                    
                    test('listeners', async () => {
                        const {store1, store2} = storagePairGenerator.generator();
                
                        const pwt = promiseWithTrigger<void>(300);
                        
                        let changeOk = false;
                        store2.events.on('CHANGE', event => {
                            changeOk = event.key==='key1' && event.newValue==='val1';
                            if( changeOk ) {
                                pwt.trigger();
                            }
                        })
                
                        store1.set('key1', 'val1');
        
                        await expect(pwt.promise).rejects.toThrow('Timed out');
                
                        expect(changeOk).toBe(false);
                
                    });
                    
                })
            })
            

            
        })
    }
}