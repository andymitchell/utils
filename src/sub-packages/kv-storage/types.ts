import { TypedCancelableEventEmitter } from "../typed-cancelable-event-emitter/index.ts";

export type RawStorageEventMap<T = any> = {
    CHANGE: (event:{key: string, newValue?: T}) => void
}

export interface RawStorage<T = any> {
    events: TypedCancelableEventEmitter<RawStorageEventMap<T>>;
    set(key:string, value:T):Promise<void>;
    get(key:string):Promise<T | undefined>;
    remove(key:string):Promise<void>;
    getAllKeys(keyNamespace:string):Promise<string[]>;
    dispose():void;
}