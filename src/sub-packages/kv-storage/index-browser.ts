
import { ChromeStorage } from "./adapters/ChromeStorage.ts";
import { MemoryStorage } from "./adapters/MemoryStorage.ts"
import { MockChromeStorageArea } from "./testing-helpers/MockChromeStorageArea.ts";


export * from './index-namespaced.ts';
export * from './index-types.ts';

export {
    ChromeStorage,
    MemoryStorage
}


// Test helpers
export {
    MockChromeStorageArea
}