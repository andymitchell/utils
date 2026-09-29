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
 * Enqueue a job on the named queue, and wait for its result.
 *
 * Jobs on one queue run one at a time, in the order they were enqueued.
 *
 * @param queueName The queue to add it to
 * @param onRun Execute the job
 * @param descriptor A label for the job. It names the job in the queue's own rejection reasons
 * (halted, timed out), in `QueueDisposedError.descriptor` and in `RUNNING_TOO_LONG` events. It is
 * never added to an error the job throws.
 * @param halt A mechanism to stop the job from running, externally 
 * @param enqueuedCallback Callback after successfully added to the queue
 * @returns What the job returns. If the job throws, rejects with exactly what it threw: the same
 * value, unchanged, whatever it is. If halted or timed out, rejects with the queue's reason as a
 * string. If the queue is disposed first, rejects with a `QueueDisposedError`.
 */
export type QueueFunction = <T>(queueName: string, onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, options?: QueueConstructorOptions, testing?: Testing) => Promise<T>;


export interface IQueue {
    emitter: TypedCancelableEventEmitter<QueueEvents>;
    /**
     * Enqueue a job, and wait for its result.
     *
     * Jobs run one at a time, in the order they were enqueued.
     *
     * @param onRun Execute the job
     * @param descriptor A label for the job. It names the job in the queue's own rejection reasons
     * (halted, timed out), in `QueueDisposedError.descriptor` and in `RUNNING_TOO_LONG` events. It
     * is never added to an error the job throws.
     * @param halt A mechanism to stop the job from running, externally
     * @param enqueuedCallback Callback after successfully added to the queue
     * @returns What the job returns. If the job throws, rejects with exactly what it threw: the
     * same value, unchanged, whatever it is. If halted or timed out, rejects with the queue's
     * reason as a string. If the queue is disposed first, rejects with a `QueueDisposedError`.
     */
    enqueue<T>(onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):PromiseLike<T>,
    /**
     * The number of active jobs in the queue
     */
    count():Promise<number>;
    /**
     * Stop the queue for good.
     *
     * Every job it still holds, whether running or waiting, is rejected with a
     * `QueueDisposedError`, and so is any job enqueued afterwards. A job's function that was
     * already running is not interrupted, but its result is no longer delivered. Disposing again
     * is harmless.
     */
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

/**
 * How a job ended, which decides how its caller's promise settles.
 *
 * - `returned`: the job finished; its caller receives `output`.
 * - `threw`: the job failed; its caller receives `error` exactly as thrown, whatever it is (even `undefined`).
 * - `queue_reason`: the queue itself ended the job (halted, timed out); its caller receives `reason`.
 */
export type JobOutcome =
    | { type: 'returned', output: unknown }
    | { type: 'threw', error: unknown }
    | { type: 'queue_reason', reason: string };

export type QueueEvents<J extends BaseItem = BaseItem> = {
    'RUNNING_TOO_LONG': (event:{job:J}) => void;
}