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

describe('listing keys', () => {

    const storeWithTwoNamespaces = async (area: chrome.storage.StorageArea) => {
        const store = new ChromeStorage(area);
        await store.set('ns1.key1', 'a large value');
        await store.set('ns2.key2', 'a large value');
        return store;
    };

    test('reads no stored values', async () => {
        const area = new MockChromeStorageArea();
        const store = await storeWithTwoNamespaces(area);
        const valueReads = vi.spyOn(area, 'get');

        expect(await store.getAllKeys()).toEqual(['ns1.key1', 'ns2.key2']);
        expect(await store.getAllKeys('ns1')).toEqual(['ns1.key1']);
        expect(valueReads).not.toHaveBeenCalled();
    });

    test('still lists keys where the browser cannot list keys on their own', async () => {
        const area = new MockChromeStorageArea();
        Object.defineProperty(area, 'getKeys', { value: undefined });
        const store = await storeWithTwoNamespaces(area);

        expect(await store.getAllKeys()).toEqual(['ns1.key1', 'ns2.key2']);
        expect(await store.getAllKeys('ns1')).toEqual(['ns1.key1']);
    });
});
