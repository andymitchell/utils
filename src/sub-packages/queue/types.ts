import type { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";


export type Testing = { suppress_long_running_warning?: boolean};

export type HaltPromise = Promise<void>;




export type QueueConstructorOptions = {
    /**
     * How long a job can be executing for before it has an error
     * 
     * Defaults to 5 minutes
     */
    max_run_time_ms?: number

    /**
     * If true, the timer for the timeout won't run. Useful when using `vi.runAllTimers` which can cause an infinite loop.
     */
    testing_disable_check_timeout?: boolean
}


type PublicQueueItem = {
    id: string, 
    created_at: number,

    /**
     * The number of times this has been attempted.
     * 
     * Starts at 0, and increments for every subsequent attempt. 
     */
    attempt: number,

    preventCompletion: (delayRetryMs:number) => void
}
export type OnRun<T = any> = (queueItem:PublicQueueItem) => T | PromiseLike<T>

/**
 * Enqueue a job
 * 
 * @param queueName The queue to add it to
 * @param onRun Execute the job
 * @param descriptor Useful name to identify it in logging / debugging
 * @param halt A mechanism to stop the job from running, externally 
 * @param enqueuedCallback Callback after successfully added to the queue
 */
export type QueueFunction = <T>(queueName: string, onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, options?: QueueConstructorOptions, testing?: Testing) => Promise<T>;


export interface IQueue {
    emitter: TypedCancelableEventEmitter<QueueEvents>;
    enqueue<T>(onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):PromiseLike<T>,
    /**
     * The number of active jobs in the queue
     */
    count():Promise<number>;
    dispose():Promise<void>
}


export type QueueTimings = {
    max_runtime_ms: number,
    check_timeout_interval_ms: number
}

/**
 * Intended to be serialisable, and just sufficient for a logger. 
 * 
 */
export type BaseItem = {
    job_id: string,
    created_at: number,
    started_at?: number,
    descriptor?: string
}


/**
 * JobItem is in memory only, even if using a serialisable data store, as it contains the callback functions. 
 * 
 * A serialiable store will typically maintain two Item definitions that derive from BaseItem: the serialisable meta data (how many runs, completed, etc.) and the in-memory version
 */
export type JobItem = BaseItem & {
	resolve: Function,
	reject: Function,
    onRun: OnRun,
    running?: boolean,
};

export type QueueEvents<J extends BaseItem = BaseItem> = {
    'RUNNING_TOO_LONG': (event:{job:J}) => void;
}