

import { sleep } from "../../../index-browser.ts";
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
    

    it.only('handles multiple async requests', async () => {
        const q = new QueueMemory('');

        const outerPromises:Promise<void>[] = [];
        const activity: Array<0 | 1> = [];
        const oneActivityRun: Array<0 | 1> = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
        let expectedActivity: Array<0 | 1> = [];

        async function runIt() {
            const innerPromises:Promise<void>[] = [];
            for( let i = 0; i < 10; i++ ) {
                
                innerPromises.push(q.enqueue(async () => {
                    activity.push(0);

                    await sleep(Math.floor(Math.random()*8));

                    activity.push(1);
                }))
                await sleep(Math.floor(Math.random()*3)+1);
            }
            await Promise.all(innerPromises);
        }
        for( let i = 0; i < 5; i++ ) {
            expectedActivity = [...expectedActivity, ...oneActivityRun];
            outerPromises.push(runIt());
            await sleep(Math.floor(Math.random()*3)+1);
        }

        await Promise.all(outerPromises);
        console.log(activity);


        expect(activity.length).toBe(10*10);
        
        expect(activity).toEqual(expectedActivity)
    })
    


});
