/**
 * Works in memory (e.g. in one tab). 
 */


import { uid } from "../../uid/uid.ts";
import preventCompletionFactory from "../common/preventCompletionFactory.ts";
import type { HaltPromise, IQueue, JobItem, OnRun } from "../types.ts";



type QueueItem = JobItem & {
    attempts: number,
	running: boolean,
    halted?: boolean,
    start_after_ts?: number
};



const emptyFunction = () => {};


export class QueueMemory implements IQueue {
    private queue:QueueItem[];
    private id:string;
    private disposed:boolean;
    private client_id:string;

    constructor(id:string) {
        this.id = id;
        this.queue = [];
        this.disposed = false;
        this.client_id = uid();
    }

    async enqueue<T>(onRun:OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):Promise<T> {
        if( this.disposed ) throw new Error(`Queue [${this.id}] with client ID ${this.client_id} is disposed, so cannot add a job.`); 
        return new Promise<T>(async (resolve, reject) => {
            const q:QueueItem = {
                job_id: uid(),
                attempts: 0,
                resolve: (result:T) => {
                    resolve(result)
                },
                reject: (...args:any[]) => {
                    reject(...args)
                },
                created_at: Date.now(),
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

    async count():Promise<number> {
        return this.queue.length;
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
        if( this.disposed ) return;

        const queueItem = this.queue[0];
        if( queueItem && !queueItem.running ) {
            this.runItem(queueItem);
        }
        
    }

    private async runItem(q:QueueItem) {
        if( this.disposed ) return;

        q.running = true;

        const delay = (delayMs:number) => {
            q.running = false;
            setTimeout(() => this.next(), delayMs+1);
        }
        if( q.start_after_ts && q.start_after_ts>Date.now() ) {
            delay(q.start_after_ts-Date.now());
            return;
        }


        try {
            const preventCompletionContainer = preventCompletionFactory();
            const output = await q.onRun({
                id: q.job_id,
                created_at: q.created_at,
                attempt: q.attempts++,
                preventCompletion: preventCompletionContainer.preventCompletion
            });
            const delayMs = preventCompletionContainer.getDelayMs();
            if( typeof delayMs==='number' ) {
                delay(delayMs);
                return;
            }
            this.completeItem(q, output);
        } catch(e) {
            this.completeItem(q, undefined, e);
        }
    }

    private completeItem(q:QueueItem, output: any, error?:any) {
        if( this.disposed ) return;
        
        if( !q.halted && this.queue[0]!==q ) {
            throw new Error("Something went wrong in queue");
        }
    
        error? q.reject(error) : q.resolve(output);
        this.queue = this.queue.filter(x => x!==q);
        this.next();
    }

    runSyncIfPossible<T>(onRun:OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):void {
        if( this.queue.length===0 ) {
            // Can run sync 
            
            const id = uid();
            // Create item to inhibit others
            const item:QueueItem = {
                job_id: id,
                attempts:0,
                running: true,
                created_at: Date.now(),
                resolve: emptyFunction,
                reject: emptyFunction,
                onRun: emptyFunction,
                descriptor
            }
            this.queue = [...this.queue, item];
            // Run it
            try {
                const preventCompletionContainer = preventCompletionFactory();
                const output = onRun({id, created_at: item.created_at, attempt: ++item.attempts, preventCompletion: preventCompletionContainer.preventCompletion });

                if( preventCompletionContainer.getDelayMs()===undefined ) {
                    // Clear it
                    this.completeItem(item, output);
                } else {
                    // Let it continue to run as normal
                }

                
            } catch(e) {
                this.completeItem(item, undefined, e);
            }
            
            return;
        } else {
            
            // @ts-ignore
            this.enqueue.apply(this, arguments);
        }
    }

    
}




