
import { disposeAllQueueIDBs, disposeAllQueues, queue, queueIDB, registerQueueTestFile } from "./global";


import { QueueFunction } from "./types";

export {
    queue,
    queueIDB,
    registerQueueTestFile,
    disposeAllQueues
}

export type {
    QueueFunction
}