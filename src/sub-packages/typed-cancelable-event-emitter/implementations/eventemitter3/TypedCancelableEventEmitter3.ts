import { EventEmitter } from 'eventemitter3'; 


import type { EventMap, IEventEmitterExtension, MergedEventMap, OnceConditionMetResponse, TypedCancel } from '../../types.ts';
import { EventEmitterExtension } from '../EventEmitterExtension.ts';
import type { ITypedEventEmitter3, ITypedEventEmitter3Source } from './types.ts';




/**
 * A helper utility for clarity of intention: take a raw event emitter class and recast it as our Typed version 
 * @param eventEmitterClass 
 * @returns 
 */
function recastAsTypedEventEmitter3<C extends { new(...args: any[]): any }>(
    eventEmitterClass: C
): { new <U extends EventMap>(): ITypedEventEmitter3Source<U> } {
    return eventEmitterClass as unknown as { new <U extends EventMap>(): ITypedEventEmitter3Source<U> };
}


/**
 * A type-friendly version of EventEmitter3 with additional functionality: 
 * - `onCancelable` - adds listener and returns a function to cancel it 
 * - `onceConditionMet` - returns a promise that completes when an event has fired with data that satisfies the predicate
 * - `conditionMetAfterTimeout` - returns a promise after a time period, with the final emitted data, and whether that satisfied the predicate
 * 
 * @example
 * interface Events extends EventMap {
 *  'CLICK': (event: {element:HTMLElement}) => void
 * }
 * const ee = new TypedCancelableEventEmitter3<Events>();
 * ee.on('CLICK', (event) => {}) // fully type checked
 * const stopListening = ee.onCancelable('CLICK', (event) => {stopListening()})
 */
export default class TypedCancelableEventEmitter3<T extends EventMap> extends recastAsTypedEventEmitter3(EventEmitter)<T> implements ITypedEventEmitter3<MergedEventMap<T>> {

    #extendedEventEmitter:IEventEmitterExtension<T>;
    constructor() {
        super();
        this.#extendedEventEmitter = new EventEmitterExtension(this);
    }


    override on<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'newListener', 
            // @ts-expect-error 'newListener' is not exposed publicily on emit (because it makes no sense for an outsider to emit it), so force it
            event, listener
        ); 
        return super.on(event, listener);
    }

    override addListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'newListener', 
            // @ts-expect-error 'newListener' is not exposed publicily on emit (because it makes no sense for an outsider to emit it), so force it
            event, listener
        ); 
        return super.addListener(event, listener);
    }

    override off<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'removeListener', 
            // @ts-expect-error 'removeListener' is not exposed publicily on emit (because it makes no sense for an outsider to emit it), so force it
            event, listener
        ); 
        return super.off(event, listener);
    }

    override removeListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        this.emit(
            'removeListener', 
            // @ts-expect-error 'removeListener' is not exposed publicily on emit (because it makes no sense for an outsider to emit it), so force it
            event, listener
        ); 
        return super.removeListener(event, listener);
    }

    
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