import { FakeIdb } from "../fake-idb/types";

export type HaltPromise = Promise<void>;
export type Testing = {idb?:FakeIdb, idb_with_multiple_clients?: boolean, suppress_long_running_warning?: boolean};


type PublicQueueItem = {
    id: string, 
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
 * @param precheck A function that runs just before the job, and can delay it or cancel it 
 */
export type QueueFunction = <T>(queueName: string, onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, precheck?: PrecheckFunction, testing?: Testing) => Promise<T>;

type PrecheckFunctionResponse = {
    cancel: true
} | {
    cancel?: false,
    proceed:true, 
    wait_for_ms?: undefined
} | {
    cancel?: boolean,
    proceed: false, 
    /**
     * Delay before trying again 
     */
    wait_for_ms: number
}
export type PrecheckFunction = () => PrecheckFunctionResponse | PromiseLike<PrecheckFunctionResponse>

export interface IQueue {
    enqueue<T>(onRun: OnRun<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, precheck?: PrecheckFunction):PromiseLike<T>
    dispose():Promise<void>
}