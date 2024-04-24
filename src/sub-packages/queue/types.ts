import { FakeIdb } from "../fake-idb/types";



type TestingIDB = {idb: FakeIdb};

//export type Queue<T = any> = (queueName:string, onRun:(...args:any[]) => T | PromiseLike<T>, descriptor?: string, testing?: TestingIDB) => Promise<T>;
export type Queue = <T>(queueName: string, onRun: (...args: any[]) => T | PromiseLike<T>, descriptor?: string, testing?: TestingIDB) => Promise<T>;
