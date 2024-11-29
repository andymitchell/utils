
import { QueueIDB } from "./idb/QueueIDB";
import { QueueMemory } from "./memory/QueueMemory";
import { QueueWorkspace } from "./QueueWorkspace";
import { disposeAllGlobalQueues, queue, queueIDB, registerTestFileUsingGlobalQueues } from "./global-queue";


import { IQueue, QueueFunction } from "./types";

export {
    queue,
    queueIDB,
    QueueMemory,
    QueueIDB,
    QueueWorkspace,
    registerTestFileUsingGlobalQueues,
    disposeAllGlobalQueues
}

export type {
    IQueue,
    QueueFunction
}