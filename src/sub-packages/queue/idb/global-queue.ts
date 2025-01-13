/*

The pro and con of the global functions is that they'd share memory space with any code that imports this package. 
That means you can have easy global queues anywhere in your code base. But you have to be sure your queue names are unique to your app to prevent clashes with other packages you might be using (who are also using this). 

It's also a huge pain for testing because it's hard to close down all queues, if you aren't sure another caller in the global space is still using it. 
This is fixed if your test runner isolates global variables per test file (as Jest does), as you can call afterAll in the test file, then disposeAllQueueIDBs to shut them down. 

*/

import { QueueIDB, TestingIDB } from "./QueueIDB";
import { HaltPromise, QueueFunction, Testing } from "../types";

const queueTestFiles:string[] = [];
let queueDbs:{[queueName:string]: QueueIDB} = {};


export async function disposeAllQueueIDBs(expectedQueueTestFile?:string) {
    if( expectedQueueTestFile ) checkTestFilesInMemoryAsExpected(expectedQueueTestFile);
    const queues = Object.values(queueDbs);
    queueDbs = {};
    await Promise.all(queues.map(x => x.dispose()));
    
}

export async function disposeAllGlobalQueuesIDB(expectedQueueTestFile?:string) {
    if( expectedQueueTestFile ) checkTestFilesInMemoryAsExpected(expectedQueueTestFile);
    await disposeAllQueueIDBs();
}
function checkTestFilesInMemoryAsExpected(expectedQueueTestFile:string) {
    if( queueTestFiles.length!==1 && expectedQueueTestFile!==queueTestFiles[0] ) {
        throw new Error(`It appears this memory space is being shared with other test files. Expected only ${expectedQueueTestFile}. Found: ${queueTestFiles.join(', ')}`);
    }
}
export function registerTestFileUsingGlobalQueuesIDB(name:string) {
    queueTestFiles.push(name);
}

export const queueIDB:QueueFunction = async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: TestingIDB):Promise<T> => {
    if( !queueDbs[queueName] ) queueDbs[queueName] = new QueueIDB(queueName, testing);
    const q:QueueIDB | undefined = queueDbs[queueName];
    if( !q ) throw new Error("noop - queue should be there");
    if( q.isTestingIdb()!==(!!testing?.idb) ) throw new Error("Must be consistent in using 'testing' on a queue name");
    
    //if( testing?.idb ) console.log("Running fake IDB");
    
    return q.enqueue(onRun, descriptor, halt, enqueuedCallback);
}

