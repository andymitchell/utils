import { EventEmitter } from 'events'; 

import type { EventMap, TypedEventEmitterNode } from './typed-emitter.ts';
import type { MergedEventMap, TypedCancel, TypedEventEmitterNodeExtended } from './types.ts';
import { ExtendedEventEmitter } from './ExtendEventEmitter.ts';


export default class TypedCancelableEventEmitter3<T extends EventMap> extends (EventEmitter as unknown as { new <U extends EventMap>(): TypedEventEmitterNode<U> })<T> implements TypedEventEmitterNodeExtended<MergedEventMap<T>> {

    #extendedEventEmitter:ExtendedEventEmitter;
    constructor() {
        super();
        this.#extendedEventEmitter = new ExtendedEventEmitter(this);
    }

    onCancelable<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): TypedCancel {
        return this.#extendedEventEmitter.onCancelable(event, listener);
    }

    onceConditionMet<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000, errorOnTimeout = false): Promise<{ status: 'ok' | 'timeout', events: Parameters<T[E]>[] }> {
        return this.#extendedEventEmitter.onceConditionMet(event, condition, timeoutMs, errorOnTimeout);
    }

    conditionMetAfterTimeout<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000): Promise<{ status: 'ok' | 'fail', events: Parameters<T[E]>[] }> {
        return this.#extendedEventEmitter.conditionMetAfterTimeout(event, condition, timeoutMs);
    }
}