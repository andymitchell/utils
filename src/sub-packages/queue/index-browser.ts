import { QueueWorkspace } from "./common/QueueWorkspace"
import { disposeAllGlobalQueuesIDB, queueIDB, registerTestFileUsingGlobalQueuesIDB } from "./idb/global-queue"
import { QueueIDB } from "./idb/QueueIDB"
import { QueueWorkspaceIDB } from "./idb/QueueWorkspaceIDB"
import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./memory/global-queue"
import { QueueMemory } from "./memory/QueueMemory"
import { IQueue, QueueFunction } from "./types"


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

