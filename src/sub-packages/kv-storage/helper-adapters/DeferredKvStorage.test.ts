import { MemoryStorage } from "../index-node.ts";
import type { IKvStorage } from "../types.ts";
import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { nextMacrotask, recordUnhandledRejections } from "../testing-helpers/unhandledRejections.ts";
import { DeferredKvStorage } from "./DeferredKvStorage.ts";

commonAdapterTests(() => new DeferredKvStorage(async () => new MemoryStorage()));

describe('when no store can be picked', () => {
    const pickFailure = new Error('no store is available');

    test('leaves no unhandled rejection, even when nothing is called', async () => {
        const unhandled = recordUnhandledRejections();

        new DeferredKvStorage(async () => { throw pickFailure });
        await nextMacrotask();

        expect(unhandled).toEqual([]);
    });

    test('every call rejects with the reason the pick failed', async () => {
        const store = new DeferredKvStorage(async () => { throw pickFailure });

        await expect(store.set('key1', 'val1')).rejects.toBe(pickFailure);
        await expect(store.get('key1')).rejects.toBe(pickFailure);
        await expect(store.remove('key1')).rejects.toBe(pickFailure);
        await expect(store.getAllKeys()).rejects.toBe(pickFailure);
    });

    test('dispose still succeeds, as there is no store to close', async () => {
        const store = new DeferredKvStorage(async () => { throw pickFailure });

        await expect(store.dispose()).resolves.toBeUndefined();
    });

    test('a picker that throws is reported like one that rejects', async () => {
        const unhandled = recordUnhandledRejections();

        const store = new DeferredKvStorage(() => { throw pickFailure });

        await expect(store.get('key1')).rejects.toBe(pickFailure);
        await expect(store.dispose()).resolves.toBeUndefined();
        await nextMacrotask();
        expect(unhandled).toEqual([]);
    });
});

describe('when disposed before the store is picked', () => {
    class DisposalRecordingStorage extends MemoryStorage {
        disposed = false;
        override async dispose() {
            this.disposed = true;
            await super.dispose();
        }
    }

    test('disposes the store once it is picked', async () => {
        const picked = new DisposalRecordingStorage();
        let supply!: (store: IKvStorage) => void;
        const store = new DeferredKvStorage(() => new Promise(resolve => { supply = resolve }));

        const disposing = store.dispose();
        supply(picked);
        await disposing;

        expect(picked.disposed).toBe(true);
    });
});
