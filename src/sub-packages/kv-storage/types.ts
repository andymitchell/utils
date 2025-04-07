import { type TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";

export type KvRawStorageEventMap<T = any> = {
    CHANGE: (event:{key: string, newValue?: T}) => void
}

export interface IKvStorage<T = any> {
    events: TypedCancelableEventEmitter<KvRawStorageEventMap<T>>;
    set(key:string, value:T):Promise<void>;
    get(key:string):Promise<T | undefined>;
    remove(key:string):Promise<void>;
    getAllKeys(keyNamespace?:string):Promise<string[]>;
    dispose():Promise<void>;
}


export interface IKvStorageNamespaced<T = any> extends IKvStorage<T> {
    
    getAllKeys():Promise<string[]>;
    
}