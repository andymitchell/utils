
import { ChromeStorage } from "./adapters/ChromeStorage.ts";
import { IdbStorage } from "./adapters/IdbStorage.ts";
import { DexieStorage } from "./adapters/DexieStorage.ts";
import { MemoryStorage } from "./adapters/MemoryStorage.ts"
import { MockChromeStorageArea } from "./testing-helpers/MockChromeStorageArea.ts";
import { DeferredKvStorage } from "./helper-adapters/DeferredKvStorage.ts";


export * from './index-namespaced.ts';
export * from './index-types.ts';

export {
    ChromeStorage,
    MemoryStorage,
    IdbStorage,
    DexieStorage,
    
    DeferredKvStorage,

    // Test helpers
    MockChromeStorageArea
}

