import { ChromeStorage } from "./ChromeStorage.ts"
import { MockChromeStorageArea } from "../testing-helpers/MockChromeStorageArea.ts"
import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts"
import { vi } from "vitest";

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

test('needs no chrome global when given a storage area', async () => {
    expect(globalThis).not.toHaveProperty('chrome');
    const store = new ChromeStorage(new MockChromeStorageArea());

    await store.set('key1', 'val1');

    expect(await store.get('key1')).toBe('val1');
});

describe('when a write fails', () => {

    const failureOf = (promise: Promise<unknown>): Promise<unknown> => promise.then(
        () => { throw new Error('expected the write to fail') },
        (error: unknown) => error
    );

    test('a write refused for quota rejects as a QuotaExceededError saying how much space is in use, and the previous value survives', async () => {
        const area = new MockChromeStorageArea({ quota_bytes: 30 });
        const store = new ChromeStorage(area);
        await store.set('key1', 'small');
        const bytesInUse = await area.getBytesInUse();

        const failure = await failureOf(store.set('key1', 'a value far too large to fit in the quota'));

        expect(failure).toBeInstanceOf(Error);
        expect(failure).toMatchObject({ name: 'QuotaExceededError', message: expect.stringContaining(`${bytesInUse} bytes`) });
        expect((failure as Error).cause).toEqual(new Error('QUOTA_BYTES quota exceeded'));
        expect(await store.get('key1')).toBe('small');
    });

    test('a write refused for quota is still reported as one where the area cannot count its bytes', async () => {
        const area = new MockChromeStorageArea({ quota_bytes: 1 });
        Object.defineProperty(area, 'getBytesInUse', { value: undefined });

        const failure = await failureOf(new ChromeStorage(area).set('key1', 'val1'));

        expect(failure).toMatchObject({ name: 'QuotaExceededError', message: expect.stringContaining('QUOTA_BYTES quota exceeded') });
        expect((failure as Error).message).not.toContain('bytes in use');
    });

    test('any other failure reaches the caller unchanged', async () => {
        const contextGone = new Error('Extension context invalidated.');
        class UnreachableArea extends MockChromeStorageArea {
            override set(): Promise<void> {
                return Promise.reject(contextGone);
            }
        }

        expect(await failureOf(new ChromeStorage(new UnreachableArea()).set('key1', 'val1'))).toBe(contextGone);
    });
});
