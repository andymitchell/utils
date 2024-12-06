import { Dialect } from "drizzle-orm";
import { isTypeExtended, typeHasKeys } from "../../../../main";
import { PgliteDatabase } from "drizzle-orm/pglite";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { OnRun } from "../../types";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export const COMMON_DATABASES = [
    'pg',
    'sqlite'
] as const;
export type CommonDatabases = typeof COMMON_DATABASES[number];
//isTypeExtended<CommonDatabases, Dialect>(true);


export type SupportedDatabaseClients = {
    'pg': PostgresJsDatabase | PgliteDatabase,
    'sqlite': LibSQLDatabase | BetterSQLite3Database
}
typeHasKeys<SupportedDatabaseClients, CommonDatabases>(true);

export type GenericDatabase = SupportedDatabaseClients['pg'];




export type QueueItemDB = {
    id: number,
    ts: number,
    client_id: string, 
    job_id: string,
    client_id_job_count: number,
    descriptor?: string,
    run_id?: string,
    start_after_ts: number,
    started_at?: number,
    completed_at: number,
}

export type JobItem = {
    job_id: string,
    created_at: number,
	resolve: Function,
	reject: Function,
    onRun: OnRun,
    running?: boolean,
    descriptor?: string
};