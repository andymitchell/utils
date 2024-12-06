

import { type QueueTableSelectPg, type QueueTablePg, type QueueTableCreatorPg, type QueueTableInsertPg } from "./queue.pg";


import { isTypeEqual, typeHasKeys } from "../../../../../main";
import { CommonDatabases } from "../types";
import { QueueTableCreatorSqlite, QueueTableSelectSqlite, QueueTableSqlite } from "./queue.sqlite";





isTypeEqual<QueueTableSelectPg, QueueTableSelectSqlite>(true); // Verify the types

export type QueueTableCreator = {
    'pg': QueueTableCreatorPg,
    'sqlite': QueueTableCreatorSqlite,
    'sqlite-libsql': QueueTableCreatorSqlite,
    'sqlite-bettersqlite3': QueueTableCreatorSqlite
}
typeHasKeys<QueueTableCreator, CommonDatabases>(true);

export type QueueTable = {
    'pg': QueueTablePg,
    'sqlite': QueueTableSqlite,
    'sqlite-libsql': QueueTableSqlite,
    'sqlite-bettersqlite3': QueueTableSqlite
}
typeHasKeys<QueueTable, CommonDatabases>(true);

export type QueueTableSelect = QueueTableSelectPg; 
export type QueueTableInsert = QueueTableInsertPg;

  