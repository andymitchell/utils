import { promiseWithTrigger, uid } from "../../../../main";
import preventCompletionFactory from "../../preventCompletionFactory";
import { HaltPromise, IQueue, JobItem, OnRun } from "../../types";
import { IQueueIo, QueueItemDB } from "./types";

type LockingRequest = {id: string, details: string, promise:Promise<void>};
export class BaseItemQueue implements IQueue {
    
    protected id:string;
    protected queueIo:IQueueIo;
    protected clientId:string = uid();
    protected jobs:Record<string, JobItem> = {};
    protected nextTimeout?: number | NodeJS.Timeout;
    protected maxRunTimeMs:number = 1000*60*5;
    protected lockingRequests:LockingRequest[] = [];
    protected disposers: Function[] = [];
    protected disposed:boolean;

    constructor(id:string, queueIo: IQueueIo) {
        this.queueIo = queueIo;
        
        
        this.disposers.push(
            this.queueIo.emitter.onCancelable('MODIFIED', () => {
                this.next();
            })
        );

        this.id = id;
        this.disposed = false;
        
        this.checkTimeout();
        
    }


    async enqueue<T>(onRun:OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?:() => void):Promise<T> {
        if( this.disposed ) throw new Error(`QueueIDB [${this.id}] is disposed, so cannot add a job.`);
        const job_id = uid();

        return new Promise(async (resolve, reject) => {
            this.jobs[job_id] = {
                job_id,
                created_at: Date.now(),
                resolve,
                reject,
                onRun,
                descriptor
            };

            const clearRequest = this.request('run');
            let item:QueueItemDB = {
                // @ts-ignore IDB will fill 'id' in
                id: undefined,

                ts: Date.now(),
                client_id: this.clientId, 
                client_id_job_count: Object.values(this.jobs).length,
                job_id,
                descriptor,
                start_after_ts: 0,
                completed_at: 0
            }
            console.log("Askm to add item", item)
            item = await this.queueIo.addItem(item);
            console.log("Added item", item)

            clearRequest();
            if( enqueuedCallback ) enqueuedCallback();
            
            if( halt ) {
                halt.then(async () => {
                    await this.completeItem(item, undefined, "Externally halted.", true);
                });
            }
        
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

    async getQueueForTesting() {
        return await this.queueIo.listItems();
    }

    async count():Promise<number> {
        return this.queueIo.countItems();
    }

    private async next(fromDelay?:boolean) {
        if( this.disposed ) return;
        
        const clearRequest = this.request('next');

        
        
        
        const nextItem = await this.queueIo.nextItem(this.clientId);
        console.log("Got next item", nextItem)
        
        if( nextItem ) {
            const {item, run_id} = nextItem;
            

            const result = await this.runItem(item);
            
            if( result && result.delayed_until_ts ) {

                await this.queueIo.updateItem(item.id, {run_id, started_at: undefined, start_after_ts: result.delayed_until_ts});

                setTimeout(() => this.next(true), (result.delayed_until_ts-Date.now())+1);
            }

            console.log("Finished next item")

        }

        clearRequest();
    }


    private async runItem(item:QueueItemDB):Promise<{delayed_until_ts?: number} | void> {
        if( this.disposed ) return;

        const job = this.jobs[item.job_id];

        if( !job ) {
            console.warn(`QueueIDB [${this.id}] Job not found.`);
            return;
        }
        if( job.running ) {
            console.warn(`QueueIDB [${this.id}] Already running job. Should not happen - here as a failsafe.`);
            return;
        }
        /*
        if( this.isTestingIdb() && (Date.now()-item.ts)>4000 && !this.testing?.suppress_long_running_warning ) {
            console.log(`QueueIDB [${this.id}] is running in testing mode, and the job has taken a several seconds to start - typically unexpected and raises possibility the test is sharing its IDB with other tests.`, {time_to_start: (Date.now()-item.ts), item});
        }
        */

        // Try to run the job's function
        try {
            job.running = true;


            const preventCompletionContainer = preventCompletionFactory();
            const output = await job.onRun({
                id: job.job_id,
                created_at: job.created_at,
                preventCompletion: preventCompletionContainer.preventCompletion
            });

            const delayMs = preventCompletionContainer.getDelayMs();
            if( typeof delayMs==='number' ) {
                job.running = false;
                return {delayed_until_ts: Date.now()+delayMs};
            }

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
            
            await this.queueIo.completeItem(item, force);
            
        } catch(e) {
            const originalErrorText =  error? `[Original Error: ${error instanceof Error? error.message : error}]` : '';
            if( e instanceof Error ) {
                e.message += ` ${originalErrorText}`;
                error = e;
            } else {
                error = new Error(`Unknown error during complete. ${originalErrorText}`);
            }
        }

        console.log("Complete item", job, item, error)
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

    
        const items = await this.queueIo.listItems();

        for( const item of items ) {
            const clientIdText = this.clientId!==item.client_id? `[Different client ID to item: ${this.clientId}]` : '';
            if( item.completed_at && item.completed_at<completedCutoff ) {
                console.log(`QueueIDB [${this.id}] cleaning up a completed item. ${clientIdText}`, {item});
                await this.queueIo.deleteItem(item.id);
            } else if( item.started_at && !item.completed_at && item.started_at<startedCutoff ) {
                console.warn(`QueueIDB [${this.id}] a started item timed out, which should never happen. ${clientIdText}`, {item});
                await this.completeItem(item, undefined, "Started, but timed out", true);
            } else if( !item.started_at && !item.completed_at && item.ts<notStartedCutoff ) {
                console.warn(`QueueIDB [${this.id}] an item never started, which should never happen. ${clientIdText}`, {item});
                await this.completeItem(item, undefined, "Item never started, timed out", true);
            }
        }

    
        clearRequest();

        if( this.nextTimeout ) clearTimeout(this.nextTimeout);
        if( !this.disposed ) {
            this.nextTimeout = setTimeout(() => {
                this.checkTimeout();
            }, 10000);
        }
    }

    
    async dispose() {
        this.disposed = true;

        if( this.nextTimeout  ) clearTimeout(this.nextTimeout);

        const jobs = Object.values(this.jobs);
        this.jobs = {};
        jobs.forEach(job => {
            job.resolve(null);
        })

        if( this.lockingRequests.length ) {
            const timeout = setTimeout(() => {
                throw new Error("Cannot dispose while things still running");
            }, 4000);
            await Promise.all(this.lockingRequests.map(x => x.promise));
            clearTimeout(timeout);
        }

        await this.queueIo.dispose(this.clientId);

    }

}