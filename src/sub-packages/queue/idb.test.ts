import "fake-indexeddb/auto"; // Not sure why needed... maybe liveQuery? 

import { uid } from "../../main";
import { fakeIdb } from "../fake-idb";
import queueIDB, { QueueIDB, disposeAll } from "./idb";
import standardQueueTests from "./standardQueueTests";
import { Queue } from "./types";

afterAll(async () => {
    await disposeAll();
}, 1000*10)

describe('QueueIDB test', () => {

    standardQueueTests(test, expect, () => {
        const queueNameSpace = uid();
        return ((queueName:string, onRun:() => void, descriptor?: string, testing?: any) => {
            return queueIDB(queueNameSpace+queueName, onRun, descriptor,  {idb: fakeIdb()})
        }) as Queue
    });
    
});
