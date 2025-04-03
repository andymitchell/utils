
import { TypedStorage } from "./TypedStorage.ts"

import { MemoryStorage } from "./index-node.ts";
import { commonNamespacedTypedTests } from "./testing-helpers/commonNamespacedTypedTests.ts";





describe('TypedStorage', () => {

    commonNamespacedTypedTests((namespace, adapter, schema) => new TypedStorage(adapter ?? new MemoryStorage(), schema, namespace), {include_schema: true});
    



    
})