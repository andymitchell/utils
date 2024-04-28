/**
 * Works in memory (e.g. in one tab). 
 */

import { uid } from "../../main";
import { HaltPromise, IQueue, QueueFunction, Testing } from "./types";

type QueueItem = {
    job_id: string,
	running: boolean,
	resolve: Function,
	reject: Function,
    onRun: Function,
    halted?: boolean,
    descriptor?: string
};



const emptyFunction = () => {};


export class QueueMemory implements IQueue {
    private queue:QueueItem[];
    private id:string;
    private disposed:boolean;
    private client_id:string;

    constructor(id:string, testing?:Testing) {
        this.id = id;
        this.queue = [];
        this.disposed = false;
        this.client_id = uid();
    }

    async enqueue<T>(onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):Promise<T> {
        if( this.disposed ) throw new Error(`Queue [${this.id}] with client ID ${this.client_id} is disposed, so cannot add a job.`); 
        return new Promise<T>((resolve, reject) => {
            const q:QueueItem = {
                job_id: uid(),
                resolve: (result:T) => {
                    resolve(result)
                },
                reject: (...args:any[]) => {
                    reject(...args)
                },
                running: false,
                onRun,
                descriptor
            }
            this.queue = [...this.queue, q];
            if( enqueuedCallback ) enqueuedCallback();
            this.next();
    
            if( halt ) halt.then(() => {
                q.halted = true;
                this.completeItem(q, undefined, "Externally halted.")
            });
        })
    }

    async dispose() {
        this.disposed = true;

        const queue = [...this.queue];
        this.queue = [];
        queue.forEach(q => {
            q.resolve(null);
        })
    }

    private next() {
    
        if( this.queue[0] && !this.queue[0].running ) {
            this.runItem(this.queue[0]);
        }
        
    }

    private async runItem(q:QueueItem) {
        q.running = true;

        try {
            const output = await q.onRun();
            this.completeItem(q, output);
        } catch(e) {
            this.completeItem(q, undefined, e);
        }
    }

    private completeItem(q:QueueItem, output: any, error?:any) {
        if( !q.halted && this.queue[0]!==q ) {
            throw new Error("Something went wrong in queue");
        }
    
        error? q.reject(error) : q.resolve(output);
        this.queue = this.queue.filter(x => x!==q);
        this.next();
    }

    runSyncIfPossible<T>(onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise):void {
        if( this.queue.length===0 ) {
            // Can run sync 
            
            // Create item to inhibit others
            const item:QueueItem = {
                job_id: uid(),
                running: true,
                resolve: emptyFunction,
                reject: emptyFunction,
                onRun: emptyFunction,
                descriptor
            }
            this.queue = [...this.queue, item];
            // Run it
            try {
                const output = onRun();
                // Clear it
                this.completeItem(item, output);
            } catch(e) {
                this.completeItem(item, undefined, e);
            }
        } else {
            // @ts-ignore
            this.run.apply(this, arguments);
        }
    }

    
}




