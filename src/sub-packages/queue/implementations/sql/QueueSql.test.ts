

import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { fileURLToPath } from 'url';
import { RawStoreTestSqlDbGenerator } from "./RawStoreTestSqlDbGenerator";
import { QueueSql } from "./QueueSql";
import { standardQueueTests } from "../../standardQueueTests";
import {v4 as uuidV4} from 'uuid';
import { HaltPromise, Testing } from "../../types";
import { QueueTable } from "./table-creators/types";
import { PgDatabase } from "drizzle-orm/pg-core";

const TESTDIR = getRelativeTestDir(import.meta.url);

beforeAll(() => {
    clearDir(TESTDIR)
})


const tdbgPg = new RawStoreTestSqlDbGenerator<'pg'>(
    TESTDIR, 
    {
        dialect: 'pg', 
        batch_size: 50
    });
let queueSqlsPg:Record<string, Promise<QueueSql>> = {};
async function newQueueSqlPg(queueName:string):Promise<QueueSql> {
    if( !queueSqlsPg[queueName] ) {

        
        queueSqlsPg[queueName] = new Promise(async accept => {
            const {db, schemas} = await tdbgPg.nextTest();
            const queueSql = new QueueSql(queueName, 'pg', Promise.resolve(db), schemas);

            accept(queueSql);
        })
    }
    return queueSqlsPg[queueName]!
}


const tdbgSqlite = new RawStoreTestSqlDbGenerator<'sqlite'>(
    TESTDIR, 
    {
        dialect: 'sqlite', 
        batch_size: 50
    });
let queueSqlsSqlite:Record<string, Promise<QueueSql>> = {};
async function newQueueSqlSqlite(queueName:string):Promise<QueueSql> {
    if( !queueSqlsSqlite[queueName] ) {

        
        queueSqlsSqlite[queueName] = new Promise(async accept => {
            const {db, schemas} = await tdbgSqlite.nextTest();
            console.log("CREATED DB FOR SQLITE");

            const rows = await db.select().from(schemas);
            console.log("GOT ROWS FOR SQLITE: ", rows);

            const queueSql = new QueueSql(queueName, 'sqlite', Promise.resolve(db), schemas);

            accept(queueSql);
        })
    }
    return queueSqlsSqlite[queueName]!
}

function getRelativeTestDir(testScriptMetaUrl:string):string {
    return `${fileIoSyncNode.directory_name(fileURLToPath(testScriptMetaUrl))}/test-schemas`;
}
function clearDir(testDir:string):void {


    if( fileIoSyncNode.has_directory(testDir) ) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}


// Do for Pg

standardQueueTests(
    test, 
    expect, 
    () => {
        return (async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void) => {
            const queueIDB = await newQueueSqlPg(queueName);
            return await queueIDB.enqueue<T>(onRun, descriptor, halt, enqueuedCallback);
        })
    },
    async () => {
        return newQueueSqlPg(uuidV4());
    }
);


// Do for sqlite
standardQueueTests(
    test, 
    expect, 
    () => {
        return (async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void) => {
            const queueIDB = await newQueueSqlSqlite(queueName);
            return await queueIDB.enqueue<T>(onRun, descriptor, halt, enqueuedCallback);
        })
    },
    async () => {
        return newQueueSqlSqlite(uuidV4());
    }
);

test('postgres-rmw works', async () => {
    const testDir = getRelativeTestDir(import.meta.url);

    const tdbgPg = new RawStoreTestSqlDbGenerator<'pg'>(
        TESTDIR, 
        {
            dialect: 'pg', 
            batch_size: 50
        })
    const {db, schemas} = await tdbgPg.nextTest();
    
    
    await db.insert(schemas).values({ 'item': {}, 'queue_id': '1' });
    const rows = await db.select().from(schemas);

    expect(rows[0]!.queue_id).toBe('1');
    
})


test('basic queue operation', async () => {
    const testDir = getRelativeTestDir(import.meta.url);

    const tdbgPg = new RawStoreTestSqlDbGenerator(
        TESTDIR, 
        {
            dialect: 'pg', 
            batch_size: 50
        })
    const {db, schemas} = await tdbgPg.nextTest();
    
    const q = new QueueSql('test', 'pg', db, schemas);

    const state = {ran: false};
    await q.enqueue(() => {
        console.log("Update ze state");
        state.ran = true;
    })

    expect(state.ran).toBe(true);
    
    
})
