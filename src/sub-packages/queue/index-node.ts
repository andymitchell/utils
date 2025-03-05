import { QueueWorkspace } from "./common/QueueWorkspace.ts"
import { disposeAllGlobalQueuesIDB, registerTestFileUsingGlobalQueuesIDB } from "./idb/global-queue.ts"
import { QueueIDB } from "./idb/QueueIDB.ts"
import { QueueWorkspaceIDB } from "./idb/QueueWorkspaceIDB.ts"

import { disposeAllGlobalQueues, queue, registerTestFileUsingGlobalQueues } from "./memory/global-queue.ts"
import { QueueMemory } from "./memory/QueueMemory.ts"
import { QueueSql } from "./sql/QueueSql.ts"
import { queueTableCreatorPg } from "./sql/table-creators/queue.pg.ts"
import type { QueueTable, QueueTableCreator } from "./sql/table-creators/types.ts"
import type { IQueue, QueueFunction } from "./types.ts"


export {
    queue,
    QueueMemory,
    QueueWorkspace,
    registerTestFileUsingGlobalQueues,
    disposeAllGlobalQueues,

    // Node can support QueueIDB so long as one is passed in (e.g. fake-indexeddb). Plus, because it adds no dependencies, there's no cost to including it in the package.
    QueueIDB,
    QueueWorkspaceIDB,
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