
import { ChromeStorage } from "./adapters/ChromeStorage.ts";
import { MemoryStorage } from "./adapters/MemoryStorage.ts"
import { DeferredKvStorage } from "./helper-adapters/DeferredKvStorage.ts";
import { MockChromeStorageArea } from "./testing-helpers/MockChromeStorageArea.ts";


export * from './index-namespaced.ts';
export * from './index-types.ts';

export {
    
    MemoryStorage,
    DeferredKvStorage
}

// These are sometimes used in node tests
export {
    ChromeStorage,
    MockChromeStorageArea
}