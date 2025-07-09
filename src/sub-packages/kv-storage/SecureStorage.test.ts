import { z } from "zod";
import { MemoryStorage } from "./adapters/MemoryStorage.ts";
import { SecureTypedStorage } from "./SecureTypedStorage.ts"
import { commonNamespacedTypedTests } from "./testing-helpers/commonNamespacedTypedTests.ts";



describe('SecureTypedStorage', () => {

    commonNamespacedTypedTests((namespace, adapter, schema) => new SecureTypedStorage(adapter ?? new MemoryStorage(), '123', schema, namespace), {include_schema: true});


    it.only("includes schema details", async () => {
        const store = new SecureTypedStorage(new MemoryStorage(), '123', z.object({id: z.number()}), 'abc')

        let error:Error | undefined;

        try {
            const result = await store.set('k1', {
                // @ts-expect-error
                id: '1'
            });
        } catch(e) {
            if( e instanceof Error ) error = e;
        }

        
        expect(error).toBeDefined();
        
        const cause:any = error?.cause;
        expect(cause?.schemaFailSummary).toBeDefined()
        expect(cause?.schemaFailSummary?.[0]?.path).toBe('id');
    })
})