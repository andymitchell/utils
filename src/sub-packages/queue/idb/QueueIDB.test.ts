import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 
import { promiseWithTrigger, sleep } from "../../../main";
import { fakeIdb } from "../../fake-idb";
import { QueueIDB } from "./QueueIDB";
import { standardQueueTests } from "../standardQueueTests";
import { HaltPromise,  Testing } from "../types";
import {v4 as uuidV4} from 'uuid';

let queueIDBs:Record<string, QueueIDB> = {};
let miscQueueIDBs:QueueIDB[] = [];
afterAll(async () => {
    const all = [...Object.values(queueIDBs), ...miscQueueIDBs];
    queueIDBs = {};
    miscQueueIDBs = [];
    await Promise.all(all.map(x => x.dispose()));
    queueIDBs = {};
}, 1000*10)

function newQueueIDB(queueName:string, testing?: Testing):QueueIDB {
    if( queueIDBs[queueName] ) return queueIDBs[queueName]!;

    if( !testing ) testing = {};
    testing.idb = fakeIdb();
    const queueIDB = new QueueIDB(queueName, testing);
    queueIDBs[queueName] = queueIDB;
    return queueIDB;
}

describe('QueueIDB class test', () => {

    
    standardQueueTests(
        test, 
        expect, 
        () => {
            return (async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void,  testing?: Testing) => {
                const queueIDB = newQueueIDB(queueName, testing);
                return await queueIDB.enqueue<T>(onRun, descriptor, halt, enqueuedCallback);
            })
        },
        () => {
            return newQueueIDB(uuidV4());
        }
    );
    
    

    test('simulate multi tab', async () => {
        const idb = fakeIdb();
        const QUEUE_NAME = 'QUEUE_MULTITAB_1';
        const q1 = new QueueIDB(QUEUE_NAME, {idb});
        const q2 = new QueueIDB(QUEUE_NAME, {idb});
        miscQueueIDBs.push(q1);
        miscQueueIDBs.push(q2);

        expect(q1.isTestingIdb()).toBe(true);
        expect(q2.isTestingIdb()).toBe(true);

        const st = Date.now();
        const state:{q1_finished_ts?: number, q2_finished_ts?: number} = {
            q1_finished_ts: undefined,
            q2_finished_ts: undefined
        }
        const addedFirst = promiseWithTrigger<void>();
        q1.enqueue(async () => {
            await sleep(200);
            state.q1_finished_ts = Date.now();
        }, 'test1', undefined, addedFirst.trigger);
        await addedFirst.promise;
        await q2.enqueue(async () => {
            await sleep(200);
            state.q2_finished_ts = Date.now();
        }, 'test2');

        expect(state.q2_finished_ts!>0).toBe(true);
        const secondRunTime = (state.q2_finished_ts!-state.q1_finished_ts!);
        expect(secondRunTime>=200).toBe(true);
        expect((state.q2_finished_ts!-st)>=400).toBe(true);

    }, 1000*10)

});
