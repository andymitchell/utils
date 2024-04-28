

import { uid } from "../../main";
import queue from "./memory";
import standardQueueTests from "./standardQueueTests";
import { QueueFunction } from "./types";

describe('QueueMemory test', () => {

    standardQueueTests(test, expect, () => {
        const queueNameSpace = uid();
        return ((queueName:string, onRun:() => void, descriptor?: string, testing?: any) => {
            return queue(queueNameSpace+queueName, onRun, descriptor, testing)
        }) as QueueFunction
    });
    
});
