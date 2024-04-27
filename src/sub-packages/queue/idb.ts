/**
 * Works across tabs, backed by an IndexedDB 
 * E.g. read and upload data sequentially from a database, without duplicating the behaviour in each tab that tracks the database.
 * 
 * (Potentially this can also be implemented with a Broadcast Channel API, if using IndexedDB isn't desirable - e.g. too slow/heavy)
 */

import Dexie, { Subscription, liveQuery } from "dexie";
import { Queue } from "./types";
import { FakeIdb } from "../fake-idb/types";
import { promiseWithTrigger, sleep, uid } from "../../main";



let queueDbs:{[queueName:string]: QueueIDB} = {};

type QueueItemDB = {
    id: number,
    ts: number,
    client_id: string, 
    job_id: string,
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
export class QueueIDB extends Dexie {
    
    private client_id: string;
    private queue: Dexie.Table<QueueItemDB, number>; // scalar is type of primary key
    private jobs:Record<string, JobItem>;
    private testing_idb: boolean;
    private nextTimeout?: number | NodeJS.Timeout;
    private dexieSubscription?: Subscription;
    private lockingRequests:LockingRequest[];

    constructor(id:string, testing?: {idb: FakeIdb}) {
        super(`queue-idb-${id}`, testing?.idb);

        this.testing_idb = !!testing?.idb;
        
        
        this.version(1).stores({
            queue: '++id,ts,eligible_at,client_id,started_at' 
        });
        this.queue = this.table('queue'); // Just informing Typescript what Dexie has already done...

        this.lockingRequests = [];
        this.client_id = uid();
        this.jobs = {};
        this.addDbListener();

        this.checkTimeout();
        
        
    }

    async run<T>(onRun:(...args: any[]) => T | PromiseLike<T>,descriptor?: string):Promise<T> {
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
            this.queue.add({
                // @ts-ignore IDB will fill 'id' in
                id: undefined,
                ts: Date.now(),
                client_id: this.client_id, 
                job_id
            }).then(() => {
                clearRequest();
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

    async getQueueForTesting() {
        return await this.queue.toArray();
    }



    private async addDbListener() {

        const canStart = (item: QueueItemDB | undefined):boolean => !!item && item.client_id===this.client_id && !item.started_at;
        const getClientIdItems = async ():Promise<QueueItemDB[]> => {
            return await this.queue.where('client_id').equals(this.client_id).sortBy('id');
        }
        
        
        const observable = liveQuery(async () => await getClientIdItems());
        
        this.dexieSubscription = observable.subscribe({
            next: async (items: QueueItemDB[]) => {
                const clearRequest = this.request('subscription-next');
                
                const firstIncompleteItem = items.find(x => !x.completed_at);
                if( firstIncompleteItem && canStart(firstIncompleteItem) ) {
                    const updatedCount = await this.queue.update(firstIncompleteItem.id, {started_at: Date.now()});
                    if( updatedCount===0 ) {
                        clearRequest();
                        throw new Error("Could not mark the item as started");
                    }
                    // In theory, the subscriber could have overlapping callbacks for the same item, but this.runItem also checks for double runs. (Otherwise need a slower extra DB call to check the DB again)
                    await this.runItem(firstIncompleteItem);
                }
                clearRequest();
            }
        })
        

        
    }

    private async runItem(item:QueueItemDB) {
        const job = this.jobs[item.job_id];

        if( !job ) {
            console.warn("Job not found.");
            return;
        }
        if( job.running ) {
            console.warn("Already running job. Should not happen - here as a failsafe.");
            debugger;
            return;
        }

        let output: any;
        
        // Try to run the job's function
        try {
            job.running = true;
            output = await job.onRun();

            // Mark it complete 
            const updatedCount = await this.queue.update(item.id, {completed_at: Date.now()});
            if( updatedCount===0 ) {
                throw new Error("Could not mark the item as complete");
            }

            this.completeItem(item.job_id, output);


        } catch(e) {
            if( e instanceof Error ) {
                this.completeItem(item.job_id, undefined, e);
            }
        }
        
        
    }


    private completeItem(job_id:string, output: any, error?:Error) {
        const item = this.jobs[job_id];
        if( !item ) throw new Error("Something went very wrong in queue: no item");

        error? item.reject(error) : item.resolve(output);
        delete this.jobs[job_id];
    }


    private async checkTimeout(
        inactiveCutoff = Date.now()-(1000*30),
        startedCutoff = Date.now()-(1000*60*1),
        completedCutoff = Date.now()-(1000*60*10)
    ) {
        
        // Get all items (any client)
        // If started + this client_id, and it's older than X minutes, kill it 
        // If completed > X mins ago, clear it 
        // If previous client_id finished X mins ago, and the next one hasn't started, clear all client ids
        

        const clearRequest = this.request('checkTimeout');
        await this.transaction('rw', this.queue, async () => {
            const lastActivityPerClientID:Record<string, number> = {};
            const items = await this.queue.orderBy('id').toArray();
    
            for( const item of items ) {
                if( item.completed_at && item.completed_at<completedCutoff ) {
                    console.log("QueueIDB cleaning up a completed item.", {item});
                    await this.queue.delete(item.id);
                } else if( item.started_at && item.started_at<startedCutoff && item.client_id===this.client_id ) {
                    console.warn("QueueIDB a started item timed out, which should never happen.", {item});
                    await this.queue.delete(item.id);
                } else {
                    if(item.started_at) lastActivityPerClientID[item.client_id] = item.completed_at ?? item.started_at;
                }
            }

            for( const clientID of Object.keys(lastActivityPerClientID) ) {
                if( lastActivityPerClientID[clientID]!<inactiveCutoff ) {
                    // Wipe all for this client ID
                    await this.queue.where('client_id').equals(clientID).delete();
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

export async function disposeAll() {
    const queues = Object.values(queueDbs);
    queueDbs = {};
    await Promise.all(queues.map(x => x.dispose()));
    
}


const queueIDB:Queue = async <T>(queueName:string, onRun:(...args: any[]) => T | PromiseLike<T>, descriptor?: string, testing?: {idb: FakeIdb}):Promise<T> => {
    let q:QueueIDB | undefined = queueDbs[queueName];
    if( !q ) { 
        q = new QueueIDB(queueName, testing);
        queueDbs[queueName] = q;
    }
    if( q.isTestingIdb()!==(!!testing?.idb) ) throw new Error("Must be consistent in using 'testing' on a queue name");
    
    //if( testing?.idb ) console.log("Running fake IDB");
    
    return q.run(onRun, descriptor);
}
export default queueIDB;