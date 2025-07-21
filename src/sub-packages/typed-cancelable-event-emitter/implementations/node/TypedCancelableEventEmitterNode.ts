import { EventEmitter } from 'events'; 


import type { EventMap, IEventEmitterExtension, MergedEventMap, OnceConditionMetResponse, TypedCancel } from '../../types.ts';
import { EventEmitterExtension } from '../EventEmitterExtension.ts';
import type { ITypedEventEmitterNode, ITypedEventEmitterNodeSource } from './types.ts';


/**
 * A helper utility for clarity of intention: take a raw event emitter class and recast it as our Typed version 
 * @param eventEmitterClass 
 * @returns 
 */
function recastAsTypedEventEmitterNode<C extends { new(...args: any[]): any }>(
    eventEmitterClass: C
): { new <U extends EventMap>(): ITypedEventEmitterNodeSource<U> } {
    return eventEmitterClass as unknown as { new <U extends EventMap>(): ITypedEventEmitterNodeSource<U> };
}

/**
 * A type-friendly version of Node's EventEmitter with additional functionality: 
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
export default class TypedCancelableEventEmitterNode<T extends EventMap> extends recastAsTypedEventEmitterNode(EventEmitter)<T> implements ITypedEventEmitterNode<MergedEventMap<T>> {

    #extendedEventEmitter:IEventEmitterExtension<T>;
    constructor() {
        super();
        this.#extendedEventEmitter = new EventEmitterExtension(this);
    }

    override on<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        return super.on(event, listener);
    }

    override addListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        return super.addListener(event, listener);
    }

    override off<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
        return super.off(event, listener);
    }

    override removeListener<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): this {
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