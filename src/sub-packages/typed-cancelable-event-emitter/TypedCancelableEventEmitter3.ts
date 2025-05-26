import { EventEmitter } from 'eventemitter3'; 

import type { EventMap, TypedEventEmitter3 } from './typed-emitter.ts';
import type { MergedEventMap, OnceConditionMetResponse, TypedCancel, TypedEventEmitter3Extended } from './types.ts';
import { ExtendedEventEmitter } from './ExtendEventEmitter.ts';


export default class TypedCancelableEventEmitter3<T extends EventMap> extends (EventEmitter as unknown as { new <U extends EventMap>(): TypedEventEmitter3<U> })<T> implements TypedEventEmitter3Extended<MergedEventMap<T>> {

    #extendedEventEmitter:ExtendedEventEmitter;
    constructor() {
        super();
        this.#extendedEventEmitter = new ExtendedEventEmitter(this);
    }

    onCancelable<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): TypedCancel {
        return this.#extendedEventEmitter.onCancelable(event, listener);
    }

    onceConditionMet<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000, errorOnTimeout = false): Promise<OnceConditionMetResponse<Parameters<T[E]>>> {
        return this.#extendedEventEmitter.onceConditionMet(event, condition, timeoutMs, errorOnTimeout);
    }

    conditionMetAfterTimeout<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000): Promise<OnceConditionMetResponse<Parameters<T[E]>>> {
        return this.#extendedEventEmitter.conditionMetAfterTimeout(event, condition, timeoutMs);
    }
}