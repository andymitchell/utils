import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 
import { QueueWorkspaceIDB } from "./QueueWorkspaceIDB";
import { fakeIdb } from "../../fake-idb";

describe('QueueWorkspace', () => {

    test('Simply runs', async () => {

        const qw = new QueueWorkspaceIDB({idb: fakeIdb()});

        const result2 = await qw.enqueueIDB('TEST_QW', async () => {
            return 456;
        });

        
        expect(result2).toBe(456);

        await qw.dispose();
    }, 1000*10)

})