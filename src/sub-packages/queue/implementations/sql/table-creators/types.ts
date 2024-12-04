

import { type QueueTableSelectPg, type QueueTablePg, type QueueTableCreatorPg, type QueueTableInsertPg } from "./queue.pg";


import { isTypeEqual, typeHasKeys } from "../../../../../main";
import { CommonDatabases } from "../types";





//isTypeEqual<QueueTableSelectPg, QueueTableSelectSqlite>(true); // Verify the types

export type QueueTableCreator = {
    'pg': QueueTableCreatorPg,
    //'sqlite': QueueTableCreatorSqlite
}
typeHasKeys<QueueTableCreator, CommonDatabases>(true);

export type QueueTable = {
    'pg': QueueTablePg,
    //'sqlite': QueueTableSqlite
}
typeHasKeys<QueueTable, CommonDatabases>(true);

export type QueueTableSelect = QueueTableSelectPg; 
export type QueueTableInsert = QueueTableInsertPg;

  