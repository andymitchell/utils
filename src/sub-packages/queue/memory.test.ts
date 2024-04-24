
import { uid } from "@andyrmitchell/utils";
import queue from "./memory";
import standardQueueTests from "./standardQueueTests";
import { Queue } from "./types";

describe('QueueMemory test', () => {

    standardQueueTests(test, expect, () => {
        const queueNameSpace = uid();
        return ((queueName:string, onRun:() => void, descriptor?: string, testing?: any) => {
            return queue(queueNameSpace+queueName, onRun, descriptor)
        }) as Queue
    });
    
});
