import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 

import { disposeAllGlobalQueuesIDB, queueIDB, registerTestFileUsingGlobalQueuesIDB } from "./global-queue.ts";

import { fakeIdb } from "../../fake-idb/index.ts";



import { HaltPromise, QueueFunction, Testing } from "../types.ts";
import { standardQueueTests } from "../common/standardQueueTests.ts";
import { QueueIDB, TestingIDB } from "./QueueIDB.ts";
import { uid } from "../../uid/uid.ts";

const TEST_FILE = 'global.test.ts';
beforeAll(async () => {
    registerTestFileUsingGlobalQueuesIDB(TEST_FILE);
})
afterAll(async () => {
    await disposeAllGlobalQueuesIDB(TEST_FILE);
}, 1000*10)


describe('queueIDB global test', () => {

    standardQueueTests(
        test, 
        expect, 
        () => {
            const queueNameSpace = uid();
            return ((queueName:string, onRun:() => void, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: any) => {
                if( !testing ) testing = {};
                testing.idb = fakeIdb();
                return queueIDB(queueNameSpace+queueName, onRun, descriptor, halt, enqueuedCallback, testing)
            }) as QueueFunction
        },
        async () => {
            const testing:TestingIDB = {};
            testing.idb = fakeIdb();
            return new QueueIDB('', testing)
        }
    );
    
});



