import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 
import { QueueWorkspace } from "./QueueWorkspace";
import { fakeIdb } from "../fake-idb";

describe('QueueWorkspace', () => {

    test('Simply runs', async () => {

        const qw = new QueueWorkspace({idb: fakeIdb()});

        const result1 = await qw.enqueue('TEST_QW', async () => {
            return 123;
        });
        const result2 = await qw.enqueueIDB('TEST_QW', async () => {
            return 456;
        });

        expect(result1).toBe(123);
        expect(result2).toBe(456);

        await qw.dispose();
    }, 1000*10)

})