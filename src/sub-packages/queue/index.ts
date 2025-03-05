import { QueueWorkspace } from "./common/QueueWorkspace.ts"
import { disposeAllGlobalQueuesIDB, queueIDB, registerTestFileUsingGlobalQueuesIDB } from "./idb/global-queue.ts"
import { QueueIDB } from "./idb/QueueIDB.ts"
import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./memory/global-queue.ts"
import { QueueMemory } from "./memory/QueueMemory.ts"
import { QueueSql } from "./sql/QueueSql.ts"
import { queueTableCreatorPg } from "./sql/table-creators/queue.pg.ts"
import type { QueueTable, QueueTableCreator } from "./sql/table-creators/types.ts"
import type { IQueue, QueueFunction } from "./types.ts"


export {
    queue,
    queueIDB,
    QueueMemory,
    QueueIDB,
    QueueWorkspace,
    registerTestFileUsingGlobalQueues,
    disposeAllGlobalQueues,
    registerTestFileUsingGlobalQueuesIDB,
    disposeAllGlobalQueuesIDB
}


export type {
    IQueue,
    QueueFunction
}



export {
    QueueSql,
    queueTableCreatorPg
}
export type {
    QueueTable,
    QueueTableCreator
}