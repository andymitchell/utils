import { ChromeStorage } from "./ChromeStorage.ts"
import { MockChromeStorageArea } from "../testing-helpers/MockChromeStorageArea.ts"
import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts"
import { vi } from "vitest";

(globalThis as any).chrome = {
    runtime: {
        lastError: null,
    },
};

commonAdapterTests(
    () => new ChromeStorage(new MockChromeStorageArea()),
    () => {
        const rawStore = new MockChromeStorageArea();
        return {
            store1: new ChromeStorage(rawStore),
            store2: new ChromeStorage(rawStore),
        }
    }
);
