
import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./global-queue";



import { HaltPromise, QueueFunction, Testing } from "../types";
import { standardQueueTests } from "../common/standardQueueTests";
import { QueueMemory } from "./QueueMemory";
import { uid } from "../../uid/uid";

const TEST_FILE = 'global.test.ts';
beforeAll(async () => {
    registerTestFileUsingGlobalQueues(TEST_FILE);
})
afterAll(async () => {
    await disposeAllGlobalQueues(TEST_FILE);
}, 1000*10)

describe('queueMemory global test', () => {

    standardQueueTests(
        test, 
        expect, 
        () => {
            const queueNameSpace = uid();
            return ((queueName:string, onRun:() => void, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: any) => {
                return queue(queueNameSpace+queueName, onRun, descriptor, halt, enqueuedCallback, testing)
            }) as QueueFunction
        },
        async () => {
            return new QueueMemory('');
        }
    );
    
});


