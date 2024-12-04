import { FakeIdb } from "../fake-idb/types";
import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter";


export type HaltPromise = Promise<void>;
export type Testing = {idb?:FakeIdb, idb_with_multiple_clients?: boolean, suppress_long_running_warning?: boolean};


type PublicQueueItem = {
    id: string, 
    created_at: number,
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
export type QueueFunction = <T>(queueName: string, onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: Testing) => Promise<T>;


export interface IQueue {
    enqueue<T>(onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):PromiseLike<T>,
    /**
     * The number of active jobs in the queue
     */
    count():Promise<number>;
    dispose():Promise<void>
}



export type JobItem = {
    job_id: string,
    created_at: number,
	resolve: Function,
	reject: Function,
    onRun: OnRun,
    running?: boolean,
    descriptor?: string
};