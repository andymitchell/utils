

import isTypeEqual from "../../../../main/types/isTypeEqual";
import typeHasKeys from "../../../../main/types/typeHasKeys";
import { type QueueTableSelectPg, type QueueTablePg, type QueueTableCreatorPg, type QueueTableInsertPg } from "./queue.pg";




import { QueueTableCreatorSqlite, QueueTableSelectSqlite, QueueTableSqlite } from "./queue.sqlite";
import { DdtDialect } from "@andyrmitchell/drizzle-dialect-types";





isTypeEqual<QueueTableSelectPg, QueueTableSelectSqlite>(true); // Verify the types

export type QueueTableCreator = {
    'pg': QueueTableCreatorPg,
    'sqlite': QueueTableCreatorSqlite
}
typeHasKeys<QueueTableCreator, DdtDialect>(true);

export type QueueTable = {
    'pg': QueueTablePg,
    'sqlite': QueueTableSqlite
}
typeHasKeys<QueueTable, DdtDialect>(true);

export type QueueTableSelect = QueueTableSelectPg; 
export type QueueTableInsert = QueueTableInsertPg;

  