import { FakeIdb } from "../fake-idb/types";

export type HaltPromise = Promise<void>;
export type Testing = {idb?:FakeIdb};

export type QueueFunction = <T>(queueName: string, onRun: (...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void, testing?: Testing) => Promise<T>;

export interface IQueue {
    enqueue<T>(onRun: (...args: any[]) => T | PromiseLike<T>, descriptor?: string, halt?: HaltPromise, enqueuedCallback?: () => void):PromiseLike<T>
    dispose():Promise<void>
}