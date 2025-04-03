import { MemoryStorage } from "./adapters/MemoryStorage.ts";
import { SecureTypedStorage } from "./SecureTypedStorage.ts"
import { commonNamespacedTypedTests } from "./testing-helpers/commonNamespacedTypedTests.ts";



describe('SecureTypedStorage', () => {

    commonNamespacedTypedTests((namespace, adapter, schema) => new SecureTypedStorage(adapter ?? new MemoryStorage(), '123', schema, namespace), {include_schema: true});


})