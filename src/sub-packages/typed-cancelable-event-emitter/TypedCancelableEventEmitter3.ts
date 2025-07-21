import { EventEmitter } from 'eventemitter3'; 

import type { EventMap, TypedEventEmitter3 } from './typed-emitter.ts';
import type { IExtendedEventEmitter, MergedEventMap, OnceConditionMetResponse, TypedCancel, TypedEventEmitter3Extended } from './types.ts';
import { ExtendedEventEmitter } from './ExtendedEventEmitter.ts';


export default class TypedCancelableEventEmitter3<T extends EventMap> extends (EventEmitter as unknown as { new <U extends EventMap>(): TypedEventEmitter3<U> })<T> implements TypedEventEmitter3Extended<MergedEventMap<T>> {

    #extendedEventEmitter:IExtendedEventEmitter<T>;
    constructor() {
        super();
        this.#extendedEventEmitter = new ExtendedEventEmitter(this);
    }


    override on<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'newListener', 
            // @ts-expect-error 'newListener' is an internal only event (not exposed on emit publicly), so just force it
            event, listener
        ); 
        return super.on(event, listener);
    }

    override addListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'newListener', 
            // @ts-expect-error 'newListener' is an internal only event (not exposed on emit publicly), so just force it
            event, listener
        ); 
        return super.addListener(event, listener);
    }

    override off<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'removeListener', 
            // @ts-expect-error 'removeListener' is an internal only event (not exposed on emit publicly), so just force it
            event, listener
        ); 
        return super.off(event, listener);
    }

    override removeListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'removeListener', 
            // @ts-expect-error 'removeListener' is an internal only event (not exposed on emit publicly), so just force it
            event, listener
        ); 
        return super.removeListener(event, listener);
    }

    //override emit<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
    override emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): boolean {
        return super.emit(event, ...args);
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