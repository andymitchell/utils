import { QueueWorkspace } from "./common/QueueWorkspace.ts"
import { disposeAllGlobalQueuesIDB, queueIDB, registerTestFileUsingGlobalQueuesIDB } from "./idb/global-queue.ts"
import { QueueIDB } from "./idb/QueueIDB.ts"
import { QueueWorkspaceIDB } from "./idb/QueueWorkspaceIDB.ts"
import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./memory/global-queue.ts"
import { QueueMemory } from "./memory/QueueMemory.ts"
import type { IQueue, QueueFunction } from "./types.ts"


export {
    queue,
    queueIDB,
    QueueMemory,
    QueueIDB,
    QueueWorkspace,
    QueueWorkspaceIDB,
    registerTestFileUsingGlobalQueues,
    disposeAllGlobalQueues,
    registerTestFileUsingGlobalQueuesIDB,
    disposeAllGlobalQueuesIDB
}


export type {
    IQueue,
    QueueFunction
}

