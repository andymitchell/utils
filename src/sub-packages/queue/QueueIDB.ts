/**
 * Goal is to be a queue that works across tabs. 
 * Despite using IndexedDB, it's not intended to be durable: it still holds its jobs in memory.
 *  The IDB is just there to enforce sequential/non-concurrent task order across tabs, if they share the same IDB. 
 * 
 * Use cases
 *  - You want to run a heavy operation only once across tabs that share data. So whichever tab picks up the job first runs it, marks it complete, and no other tab races to run it concurrently. 
 * 
 * (Potentially this can also be implemented with a Broadcast Channel API, if using IndexedDB isn't desirable - e.g. too slow/heavy)
 */

import Dexie, { Subscription, liveQuery } from "dexie";
import { HaltPromise, IQueue, QueueFunction, Testing } from "./types";
import { FakeIdb } from "../fake-idb/types";
import { promiseWithTrigger, sleep, uid } from "../../main";





type QueueItemDB = {
    id: number,
    ts: number,
    client_id: string, 
    job_id: string,
    client_id_job_count: number,
    descriptor?: string,
    run_id?: string,
    started_at?: number,
    completed_at?: number,
}

type JobItem = {
    job_id: string,
	resolve: Function,
	reject: Function,
    onRun: Function,
    running?: boolean,
    descriptor?: string
};

type LockingRequest = {id: string, details: string, promise:Promise<void>};
export class QueueIDB extends Dexie implements IQueue {
    
    private id:string;
    private client_id: string;
    private queue: Dexie.Table<QueueItemDB, number>; // scalar is type of primary key
    private jobs:Record<string, JobItem>;
    private testing_idb: boolean;
    private nextTimeout?: number | NodeJS.Timeout;
    private dexieSubscription?: Subscription;
    private maxRunTimeMs:number = 1000*60*5;
    private lockingRequests:LockingRequest[];
    private disposed:boolean;

    constructor(id:string, testing?: Testing) {
        super(`queue-idb-${id}`, testing?.idb);

        this.testing_idb = !!testing?.idb;
        
        
        this.version(1).stores({
            queue: '++id,ts,eligible_at,client_id,started_at' 
        });
        this.queue = this.table('queue'); // Just informing Typescript what Dexie has already done...

        this.id = id;
        this.lockingRequests = [];
        this.client_id = uid();
        this.jobs = {};
        this.addDbListener();
        this.disposed = false;

        this.checkTimeout();
        
        if( this.isTestingIdb() ) this.testingInitialHealthCheck();
        
    }

    async enqueue<T>(onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?:() => void):Promise<T> {
        if( this.disposed ) throw new Error(`QueueIDB [${this.id}] with client ID ${this.client_id} is disposed, so cannot add a job.`);
        const job_id = uid();

        return new Promise((resolve, reject) => {
            this.jobs[job_id] = {
                job_id,
                resolve,
                reject,
                onRun,
                descriptor
            };

            const clearRequest = this.request('run');
            const item:QueueItemDB = {
                // @ts-ignore IDB will fill 'id' in
                id: undefined,
                ts: Date.now(),
                client_id: this.client_id, 
                client_id_job_count: Object.values(this.jobs).length,
                job_id,
                descriptor
            }
            this.queue.add(item).then((id:number) => {
                item.id = id;
                clearRequest();
                if( enqueuedCallback ) enqueuedCallback();
                if( halt ) {
                    halt.then(async () => {
                        await this.completeItem(item, undefined, "Externally halted.", true);
                        await this.disposeIfEmptyToClearTests();
                    });
                }
            })

        });
        
    }

    private request(details:string):() => void {
        const pwt = promiseWithTrigger<void>();
        const request = {id: uid(), details, promise: pwt.promise};
        this.lockingRequests.push(request);
        return () => {
            this.lockingRequests = this.lockingRequests.filter(x => x.id!==request.id);
            pwt.trigger();
        }
    }

    isTestingIdb() {
        return this.testing_idb;
    }
    private async testingInitialHealthCheck() {
        const rows = await this.queue.toArray();
        if( rows.length>0 ) {
            console.log(`QueueIDB [${this.id}] with client ID ${this.client_id} is being constructed in testing mode, but there's already ${rows.length} items in the queue. This might be ok - e.g. if testing simulating multiple tabs. But it might also indicate an undesirable sharing of fake IDB.`);
        }
    }
    async getQueueForTesting() {
        return await this.queue.toArray();
    }
    private async disposeIfEmptyToClearTests() {
        const items = await this.queue.where('client_id').equals(this.client_id).toArray();
        if(items.length===0) {
            await this.dispose();
        }
    }



    private async addDbListener() {

        const observable = liveQuery(async () => this.queue.toArray());
        
        this.dexieSubscription = observable.subscribe({
            next: async () => {
                const clearRequest = this.request('subscription-next');

                const run_id = uid();
                let items:QueueItemDB[] | undefined;
                let firstIncompleteItem:QueueItemDB | undefined;
                let markedStarted:boolean = false;
                await this.transaction('rw', this.queue, async () => {
                    items = await this.queue.orderBy('id').toArray();

                    const somethingRunning = items.some(x => x.started_at && !x.completed_at);
                    firstIncompleteItem = items.find(x => !x.completed_at );

                    if( !somethingRunning && firstIncompleteItem && firstIncompleteItem.client_id===this.client_id ) {
                        const now = Date.now();
                        firstIncompleteItem.run_id = run_id;
                        firstIncompleteItem.started_at = now;
                        markedStarted = (await this.queue.update(firstIncompleteItem.id, {run_id, started_at: now}))>0;
                    }
                })

                if( firstIncompleteItem && markedStarted ) {
                    await this.runItem(firstIncompleteItem);
                }

                clearRequest();
            }
        })
        

        
    }

    private async runItem(item:QueueItemDB) {
        const job = this.jobs[item.job_id];

        if( !job ) {
            console.warn(`QueueIDB [${this.id}] Job not found.`);
            return;
        }
        if( job.running ) {
            console.warn(`QueueIDB [${this.id}] Already running job. Should not happen - here as a failsafe.`);
            return;
        }
        if( this.isTestingIdb() && (Date.now()-item.ts)>4000 ) {
            console.log(`QueueIDB [${this.id}] is running in testing mode, and the job has taken a several seconds to start - typically unexpected and raises possibility the test is sharing its IDB with other tests.`, {time_to_start: (Date.now()-item.ts), item});
        }

        // Try to run the job's function
        try {
            job.running = true;
            const output = await job.onRun();
            this.completeItem(item, output, undefined);
        } catch(e) {
            this.completeItem(item, undefined, e);
        }
    }

    private async completeItem(item:QueueItemDB, output:unknown, error:unknown, force?: boolean) {
        const job = this.jobs[item.job_id];

        try {

            delete this.jobs[item.job_id];

            // Mark it complete 
            let latestItem: QueueItemDB | undefined;
            let markedComplete:boolean = false;
            await this.transaction('rw', this.queue, async () => {
                latestItem = await this.queue.get(item.id);
                if( !latestItem || (!force && latestItem.run_id!==item.run_id) ) {
                    console.warn(`QueueIDB [${this.id}] The job running in memory did not match the job instance ID it was started with in the db.`, {latestItem, item});
                    return;
                }
                markedComplete = (await this.queue.update(item.id, {completed_at: Date.now()})>0);
            });
            if( !markedComplete ) {
                throw new Error(`QueueIDB [${this.id}] Could not mark the item as complete.\n\n${JSON.stringify({item, latestItem})}`);
            }
        } catch(e) {
            const originalErrorText =  error? `[Original Error: ${error instanceof Error? error.message : error}]` : '';
            if( e instanceof Error ) {
                e.message += ` ${originalErrorText}`;
                error = e;
            } else {
                error = new Error(`Unknown error during complete. ${originalErrorText}`);
            }
        }

        if( job ) {
            if( error ) {
                job.reject(error);
            } else {
                job.resolve(output);
            }
        }
        
    }


    private async checkTimeout(
        notStartedCutoff = Date.now()-(1000*60*60*24),
        startedCutoff = Date.now()-this.maxRunTimeMs,
        completedCutoff = Date.now()-(1000*60*1)
    ) {
        
        const clearRequest = this.request('checkTimeout');
        await this.transaction('rw', this.queue, async () => {
            const items = await this.queue.orderBy('id').toArray();
    
            for( const item of items ) {
                const clientIdText = this.client_id!==item.client_id? `[Different client ID to item: ${this.client_id}]` : '';
                if( item.completed_at && item.completed_at<completedCutoff ) {
                    console.log(`QueueIDB [${this.id}] cleaning up a completed item. ${clientIdText}`, {item});
                    await this.queue.delete(item.id);
                } else if( item.started_at && !item.completed_at && item.started_at<startedCutoff ) {
                    console.warn(`QueueIDB [${this.id}] a started item timed out, which should never happen. ${clientIdText}`, {item});
                    await this.completeItem(item, undefined, "Started, but timed out", true);
                } else if( !item.started_at && !item.completed_at && item.ts<notStartedCutoff ) {
                    console.warn(`QueueIDB [${this.id}] an item never started, which should never happen. ${clientIdText}`, {item});
                    await this.completeItem(item, undefined, "Item never started, timed out", true);
                }
            }

        });
        clearRequest();

        if( this.nextTimeout ) clearTimeout(this.nextTimeout);
        this.nextTimeout = setTimeout(() => {
            this.checkTimeout();
        }, 10000);
    }

    
    async dispose() {
        this.disposed = true;
        if( this.lockingRequests.length ) {
            const timeout = setTimeout(() => {
                throw new Error("Cannot dispose while things still running");
            }, 4000);
            await Promise.all(this.lockingRequests.map(x => x.promise));
            clearTimeout(timeout);
        }

        if( this.dexieSubscription ) {
            this.dexieSubscription.unsubscribe();
        }

        await this.queue.where('client_id').equals(this.client_id).delete();

        super.close();

        if( this.nextTimeout  ) {
            clearTimeout(this.nextTimeout);
        }

        const jobs = Object.values(this.jobs);
        this.jobs = {};
        jobs.forEach(job => {
            job.resolve(null);
        })

        // Dexie's unsubscribe (and maybe close) aren't promises, but they do take time to run, breaking tests by leaving open handles. 
        await sleep(3000);
    }

}