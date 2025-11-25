/*

The pro and con of the global functions is that they'd share memory space with any code that imports this package. 
That means you can have easy global queues anywhere in your code base. But you have to be sure your queue names are unique to your app to prevent clashes with other packages you might be using (who are also using this). 

It's also a huge pain for testing because it's hard to close down all queues, if you aren't sure another caller in the global space is still using it. 
This is fixed if your test runner isolates global variables per test file (as Jest does), as you can call afterAll in the test file, then disposeAllQueueIDBs to shut them down. 

*/


import { QueueMemory } from "./QueueMemory.ts";
import type { HaltPromise, QueueConstructorOptions, QueueFunction, Testing } from "../types.ts";

const queueTestFiles:string[] = [];
let queuesMemorys:{[queueName:string]: QueueMemory} = {};


export const queueRunSyncIfPossible = <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise,  testing?: Testing):void => {
    if( !queuesMemorys[queueName] ) queuesMemorys[queueName] = new QueueMemory(queueName);
    const q:QueueMemory | undefined = queuesMemorys[queueName];
    if( !q ) throw new Error("noop - queue should be there");
    
    return q.runSyncIfPossible(onRun, descriptor, halt);
}
    
export const queue:QueueFunction = async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void,options?: QueueConstructorOptions,  testing?: Testing):Promise<T> => {
    if( !queuesMemorys[queueName] ) queuesMemorys[queueName] = new QueueMemory(queueName, options);
    const q:QueueMemory | undefined = queuesMemorys[queueName];
    if( !q ) throw new Error("noop - queue should be there");
    
    return q.enqueue(onRun, descriptor, halt, enqueuedCallback);
}



export async function disposeAllQueueMemorys(expectedQueueTestFile?:string) {
    if( expectedQueueTestFile ) checkTestFilesInMemoryAsExpected(expectedQueueTestFile);
    const queues = Object.values(queuesMemorys);
    queuesMemorys = {};
    await Promise.all(queues.map(x => x.dispose()));
}
export async function disposeAllGlobalQueues(expectedQueueTestFile?:string) {
    if( expectedQueueTestFile ) checkTestFilesInMemoryAsExpected(expectedQueueTestFile);
    await disposeAllQueueMemorys();
}
function checkTestFilesInMemoryAsExpected(expectedQueueTestFile:string) {
    if( queueTestFiles.length!==1 && expectedQueueTestFile!==queueTestFiles[0] ) {
        throw new Error(`It appears this memory space is being shared with other test files. Expected only ${expectedQueueTestFile}. Found: ${queueTestFiles.join(', ')}`);
    }
}
export function registerTestFileUsingGlobalQueues(name:string) {
    queueTestFiles.push(name);
}
