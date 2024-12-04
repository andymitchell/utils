

import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { fileURLToPath } from 'url';
import { RawStoreTestSqlDbGenerator } from "./RawStoreTestSqlDbGenerator";
import { QueueSql } from "./QueueSql";
import { standardQueueTests } from "../../standardQueueTests";
import {v4 as uuidV4} from 'uuid';
import { HaltPromise, Testing } from "../../types";
import { QueueTable } from "./table-creators/types";

const TESTDIR = getRelativeTestDir(import.meta.url);

beforeAll(() => {
    clearDir(TESTDIR)
})


const tdbg = new RawStoreTestSqlDbGenerator<'pg'>(TESTDIR, 'pg', 50);
let queueSqls:Record<string, Promise<QueueSql>> = {};
async function newQueueSql(queueName:string):Promise<QueueSql> {
    if( !queueSqls[queueName] ) {

        
        queueSqls[queueName] = new Promise(async accept => {
            console.log("GENERATE NEW TEST DB: "+queueName);
            const {db, schemas} = await tdbg.nextTest();
            const queueSql = new QueueSql(queueName, Promise.resolve(db), schemas);

            accept(queueSql);
        })
    }
    return queueSqls[queueName]!
    
}

function getRelativeTestDir(testScriptMetaUrl:string):string {
    return `${fileIoSyncNode.directory_name(fileURLToPath(testScriptMetaUrl))}/test-schemas`;
}
function clearDir(testDir:string):void {


    if( fileIoSyncNode.has_directory(testDir) ) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}


standardQueueTests(
    test, 
    expect, 
    () => {
        return (async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void) => {
            const queueIDB = await newQueueSql(queueName);
            return await queueIDB.enqueue<T>(onRun, descriptor, halt, enqueuedCallback);
        })
    },
    async () => {
        return newQueueSql(uuidV4());
    }
);

test('postgres-rmw works', async () => {
    const testDir = getRelativeTestDir(import.meta.url);

    const tdbg = new RawStoreTestSqlDbGenerator<'pg'>(testDir, 'pg');
    const {db, schemas} = await tdbg.nextTest();
    
    
    await db.insert(schemas).values({ 'item': {}, 'queue_id': '1' });
    const rows = await db.select().from(schemas);

    expect(rows[0]!.queue_id).toBe('1');
    
})


test('basic queue operation', async () => {
    const testDir = getRelativeTestDir(import.meta.url);

    const tdbg = new RawStoreTestSqlDbGenerator(testDir, 'pg');
    const {db, schemas} = await tdbg.nextTest();
    
    const q = new QueueSql('test', Promise.resolve(db), schemas);

    const state = {ran: false};
    await q.enqueue(() => {
        console.log("Update ze state");
        state.ran = true;
    })

    expect(state.ran).toBe(true);
    
    
})
