
import preventCompletionFactory from "../../preventCompletionFactory.ts";
import type { HaltPromise, IQueue, JobItem, JobOutcome, OnRun, QueueConstructorOptions, QueueEvents, QueueTimings } from "../../../types.ts";
import type { IQueueIo, BaseItemDurable } from "./types.ts";
import { uid } from "../../../../uid/uid.ts";
import { promiseWithTrigger } from "../../../../../main/misc.ts";
import { MAX_RUNTIME_MS } from "../../../consts.ts";
import { calculateTimings } from "../../calculateTimings.ts";
import { TypedCancelableEventEmitter } from "../../../../typed-cancelable-event-emitter/index.ts";
import { settleJob } from "../../settleJob.ts";
import { QueueDisposedError } from "../../QueueDisposedError.ts";

type LockingRequest = {id: string, details: string, promise:Promise<void>};

/**
 * The base class for queues that store and execute items 
 */
export class BaseItemQueue implements IQueue {
    

    emitter = new TypedCancelableEventEmitter<QueueEvents>;

    protected id:string;
    protected queueIo:IQueueIo;
    protected clientId:string = uid();
    protected jobs:Record<string, JobItem> = {};
    protected nextTimeout?: number | NodeJS.Timeout;
    protected timings:QueueTimings;
    
    protected lockingRequests:LockingRequest[] = [];
    protected disposers: Function[] = [];
    protected disposed:boolean;
    private disposing?:Promise<void>;

    constructor(id:string, queueIo: IQueueIo, options?:QueueConstructorOptions) {
        this.queueIo = queueIo;
        this.timings = calculateTimings(options);


        this.queueIo.emitter.addListener('RUNNING_TOO_LONG', event => 
            this.emitter.emit('RUNNING_TOO_LONG', event)
        )
        
        this.disposers.push(
            this.queueIo.emitter.onCancelable('MODIFIED', () => {
                this.next();
            })
        );

        this.id = id;
        this.disposed = false;
        
        if( !options?.testing_disable_check_timeout ) {
            this.checkTimeout();
        }
        
    }


    async enqueue<T>(onRun:OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?:() => void):Promise<T> {
        if( this.disposed ) throw new QueueDisposedError(this.id, descriptor);
        const job_id = uid();

        return new Promise(async (resolve, reject) => {
            this.jobs[job_id] = {
                job_id,
                created_at: Date.now(),
                resolve,
                reject,
                onRun,
                descriptor,
                
            };

            let item:BaseItemDurable;
            const clearRequest = this.request('run');
            try {
                item = {
                    
                    attempts: 0,
                    created_at: Date.now(),
                    client_id: this.clientId, 
                    client_id_job_count: Object.values(this.jobs).length,
                    job_id,
                    descriptor,
                    start_after_ts: 0,
                    completed_at: 0,
                    // @ts-ignore the implementor (e.g. IDB) will fill 'id' in
                    id: undefined,
                }
                
                item = await this.queueIo.addItem(item);
                

            } catch(e) {
                reject(e);
            } finally {
                clearRequest();
            }
            if( enqueuedCallback ) enqueuedCallback();
            
            if( halt ) {
                halt.then(async () => {
                    await this.completeItem(item, {type: 'queue_reason', reason: "Externally halted."}, true);
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

        try {
            
            
            const nextItem = await this.queueIo.nextItem(this.clientId);
            
            
            if( nextItem ) {
                const {item, run_id} = nextItem;
                

                const result = await this.runItem(item);
                
                if( result && result.delayed_until_ts ) {

                    // Single write: incrementing attempts must be atomic with making the item
                    // claimable again, otherwise a MODIFIED-triggered re-entrant next() can
                    // re-claim the item with a stale attempt count.
                    await this.queueIo.updateItem(item.id, {run_id, started_at: undefined, start_after_ts: result.delayed_until_ts, attempts: item.attempts+1});

                    setTimeout(() => this.next(true), (result.delayed_until_ts-Date.now())+1);
                }

                

            }

        } finally {
            clearRequest();
        }

    }


    private async runItem(item:BaseItemDurable):Promise<{delayed_until_ts?: number} | void> {
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
                attempt: item.attempts,
                created_at: job.created_at,
                preventCompletion: preventCompletionContainer.preventCompletion
            });

            const delayMs = preventCompletionContainer.getDelayMs();
            if( typeof delayMs==='number' ) {
                job.running = false;
                return {delayed_until_ts: Date.now()+delayMs};
            }

            this.completeItem(item, {type: 'returned', output});
        } catch(e) {
            this.completeItem(item, {type: 'threw', error: e});
        }

    }

    private async completeItem(item:BaseItemDurable, outcome:JobOutcome, force?: boolean) {
        const job = this.jobs[item.job_id];
        delete this.jobs[item.job_id];

        let storeFailure: {error: unknown} | undefined;
        try {
            await this.queueIo.completeItem(item, force);
        } catch(e) {
            storeFailure = {error: e};
        }

        // Nobody is waiting on a job the queue has already let go of (e.g. it was disposed).
        if( !job ) return;

        if( storeFailure ) {
            if( outcome.type==='returned' ) {
                // The job's work is done but could not be recorded, so its caller must not be told all is well.
                settleJob(job, {type: 'threw', error: storeFailure.error});
                return;
            }
            // The job had already failed, and that failure is the one its caller hears.
            console.warn(`QueueIDB [${this.id}] could not mark a failed job as complete.`, {descriptor: item.descriptor, storeError: storeFailure.error});
        }

        settleJob(job, outcome);
    }


    private async checkTimeout(
        notStartedCutoff = Date.now()-(1000*60*60*24),
        startedCutoff = Date.now()-this.timings.max_runtime_ms,
        completedCutoff = Date.now()-(1000*60*1)
    ) {

        
        
        const clearRequest = this.request('checkTimeout');
        try {
        
            const items = await this.queueIo.listItems();
            if( this.disposed ) return;
            
            

            for( const item of items ) {
                const clientIdText = this.clientId!==item.client_id? `[Different client ID to item: ${this.clientId}]` : '';
                if( item.completed_at && item.completed_at<completedCutoff ) {
                    console.log(`QueueIDB [${this.id}] cleaning up a completed item. ${clientIdText}`, {item});
                    await this.queueIo.deleteItem(item.id);
                } else if( item.started_at && !item.completed_at && item.started_at<startedCutoff ) {
                    console.warn(`QueueIDB [${this.id}] a started item timed out, which should never happen. ${clientIdText}`, {item});
                    this.queueIo.emitter.emit('RUNNING_TOO_LONG', {job: item});
                    await this.completeItem(item, {type: 'queue_reason', reason: "Started, but timed out"}, true);
                } else if( !item.started_at && !item.completed_at && item.created_at<notStartedCutoff ) {
                    console.warn(`QueueIDB [${this.id}] an item never started, which should never happen. ${clientIdText}`, {item});
                    await this.completeItem(item, {type: 'queue_reason', reason: "Item never started, timed out"}, true);
                }
            }

        } finally {
            clearRequest();
        }
    
        

        if( this.nextTimeout ) clearTimeout(this.nextTimeout);
        if( !this.disposed ) {
            this.nextTimeout = setTimeout(() => {
                this.checkTimeout();
            }, this.timings.check_timeout_interval_ms);
        }
    }

    /**
     * Stops the queue for good, and releases what it holds in its store.
     *
     * Every job still held, whether running or waiting, is rejected with a `QueueDisposedError`,
     * and so is any job enqueued afterwards. A job's function that was already running is not
     * interrupted, and disposal finishes once it has.
     *
     * @returns A promise that resolves once disposal is complete. Calling it again returns the same
     * promise, so disposing twice is harmless.
     */
    dispose():Promise<void> {
        if( !this.disposing ) this.disposing = this.disposeOnce();
        return this.disposing;
    }

    private async disposeOnce() {
        this.disposed = true;

        

        this.emitter.removeAllListeners();

        if( this.nextTimeout  ) clearTimeout(this.nextTimeout);

        const jobs = Object.values(this.jobs);
        this.jobs = {};
        jobs.forEach(job => {
            job.reject(new QueueDisposedError(this.id, job.descriptor));
        })


        if( this.lockingRequests.length ) {
            const timeout = setTimeout(() => {
                console.warn("Error: Cannot dispose while things still running [4000ms]");
            }, 4000);
            await Promise.all(this.lockingRequests.map(x => x.promise));
            clearTimeout(timeout);
        }

        await this.queueIo.dispose(this.clientId);
    


    }

}