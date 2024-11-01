import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 

import { disposeAllGlobalQueues, queue, queueIDB, registerTestFileUsingGlobalQueues } from ".";
import {  uid } from "../../main";
import { fakeIdb } from "../fake-idb";



import { HaltPromise, PrecheckFunction, QueueFunction } from "./types";
import { standardQueueTests } from "./standardQueueTests";

const TEST_FILE = 'global.test.ts';
beforeAll(async () => {
    registerTestFileUsingGlobalQueues(TEST_FILE);
})
afterAll(async () => {
    await disposeAllGlobalQueues(TEST_FILE);
}, 1000*10)

describe('queueMemory global test', () => {

    standardQueueTests(test, expect, () => {
        const queueNameSpace = uid();
        return ((queueName:string, onRun:() => void, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: any) => {
            return queue(queueNameSpace+queueName, onRun, descriptor, halt, enqueuedCallback, testing)
        }) as QueueFunction
    });
    
});



describe('queueIDB global test', () => {

    standardQueueTests(test, expect, () => {
        const queueNameSpace = uid();
        return ((queueName:string, onRun:() => void, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: any) => {
            if( !testing ) testing = {};
            testing.idb = fakeIdb();
            return queueIDB(queueNameSpace+queueName, onRun, descriptor, halt, enqueuedCallback, testing)
        }) as QueueFunction
    });
    
});



