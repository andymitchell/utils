import { QueueWorkspace } from "./common/QueueWorkspace"
import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./memory/global-queue"
import { QueueMemory } from "./memory/QueueMemory"
import { IQueue, QueueFunction } from "./types"


export {
    queue,
    QueueMemory,
    
    QueueWorkspace,
    registerTestFileUsingGlobalQueues,
    disposeAllGlobalQueues,
    
}


export type {
    IQueue,
    QueueFunction
}

