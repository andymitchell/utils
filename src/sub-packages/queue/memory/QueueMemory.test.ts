
import { standardQueueTests } from "../common/standardQueueTests.ts";
import type { HaltPromise, Testing } from "../types.ts";
import { QueueMemory } from "./QueueMemory.ts";
import {v4 as uuidV4} from 'uuid';


let queues:Record<string, QueueMemory> = {};

afterAll(async () => {
    const all = [...Object.values(QueueMemory)];
    queues = {};
    await Promise.all(all.map(x => x.dispose()));
    queues = {};
}, 1000*10)

function newQueue(queueName:string, testing?: Testing):QueueMemory {
    if( queues[queueName] ) return queues[queueName]!;

    const queueMemory = new QueueMemory(queueName);
    queues[queueName] = queueMemory;
    return queueMemory;
}

describe('QueueMemory class test', () => {

    
    standardQueueTests(
        test, 
        expect, 
        () => {
            return (async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: Testing) => {
                const queueMemory = newQueue(queueName, testing);
                return await queueMemory.enqueue<T>(onRun, descriptor, halt, enqueuedCallback);
            })
        },
        async () => {
            return newQueue(uuidV4());
        }
    );
    
    


});
