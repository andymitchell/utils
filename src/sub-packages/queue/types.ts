import { FakeIdb } from "../fake-idb/types";



export type Testing = {halt?:Promise<void>, idb?:FakeIdb};

//export type Queue<T = any> = (queueName:string, onRun:(...args:any[]) => T | PromiseLike<T>, descriptor?: string, testing?: TestingIDB) => Promise<T>;
export type QueueFunction = <T>(queueName: string, onRun: (...args: any[]) => T | PromiseLike<T>, descriptor?: string, testing?: Testing) => Promise<T>;
