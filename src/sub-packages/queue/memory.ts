/**
 * Works in memory (e.g. in one tab). 
 */

import { Queue } from "./types";

type QueueItem = {
    queueName: string,
	running: boolean,
	resolve: Function,
	reject: Function,
    onRun: Function,
    descriptor?: string
};

const queues:{[queueName:string]: Array<QueueItem>} = {};

const emptyFunction = () => {};

export function queueRunSyncIfPossible(queueName:string, onRun:Function, descriptor?: string):void {
    if( !queues[queueName] ) queues[queueName] = [];

    if( queues[queueName]!.length===0 ) {
        // Can run sync 
        
        // Create item to inhibit others
        const item:QueueItem = {
            queueName,
            running: true,
            resolve: emptyFunction,
            reject: emptyFunction,
            onRun: emptyFunction,
            descriptor
        }
        queues[queueName] = [...(queues[queueName] ?? []), item];
        // Run it
        try {
            const output = onRun();
            // Clear it
            completeItem(item, output);
        } catch(e) {
            completeItem(item, undefined, e);
        }
    } else {
        // @ts-ignore
        queue.apply(this, arguments);
    }
}


const queue:Queue = async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string):Promise<T> => {
    if( !queues[queueName] ) queues[queueName] = [];
    
    return new Promise<T>((resolve, reject) => {
        queues[queueName] = [...(queues[queueName] ?? []), {
            queueName,
            resolve: (result:T) => {
                resolve(result)
            },
            reject: (...args:any[]) => {
                reject(...args)
            },
            running: false,
            onRun,
            descriptor
        }];
        next();
    })
}
export default queue;


function next() {
    for( const queueName in queues ) {
        const queue = queues[queueName];
        if( queue && queue[0] && !queue[0].running ) {
            runItem(queue[0]);
        }
    }
}

async function runItem(q:QueueItem) {
    q.running = true;

    try {
        const output = await q.onRun();
        completeItem(q, output);
    } catch(e) {
        completeItem(q, undefined, e);
    }
}

function completeItem(q:QueueItem, output: any, error?:any) {
    const queueItem = queues[q.queueName];
    if( !queueItem || queueItem[0]!==q ) throw new Error("Something went very wrong in queue");

    error? q.reject(error) : q.resolve(output);
    queues[q.queueName] = queueItem.filter(x => x!==q);
    next();
}
