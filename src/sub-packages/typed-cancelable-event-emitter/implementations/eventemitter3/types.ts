import type { EventMap, IEventEmitterExtension } from "../../types.ts";

/**
 * A typed version of EventEmitter3, extended with helpful functions in IEventEmitterExtension (e.g. onCancelable)
 */
export type ITypedEventEmitter3<T extends EventMap> = ITypedEventEmitter3Source<T> & IEventEmitterExtension<T>;

/**
 * Type-safe event emitter for eventemitter3
 *
 * Use it like this:
 *
 * ```typescript
 * type MyEvents = {
 *   error: (error: Error) => void;
 *   message: (from: string, content: string) => void;
 * }
 *
 * const myEmitter = new EventEmitter() as TypedEmitter<MyEvents>;
 *
 * myEmitter.emit("error", "x")  // <- Will catch this type error;
 * ```
 */
export interface ITypedEventEmitter3Source<Events extends EventMap> {
    addListener<E extends keyof Events>(event: E, listener: Events[E]): this
    on<E extends keyof Events>(event: E, listener: Events[E]): this
    once<E extends keyof Events>(event: E, listener: Events[E]): this

    off<E extends keyof Events>(event: E, listener: Events[E]): this
    removeAllListeners<E extends keyof Events>(event?: E): this
    removeListener<E extends keyof Events>(event: E, listener: Events[E]): this

    emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): boolean
    // The sloppy `eventNames()` return type is to mitigate type incompatibilities - see #5
    eventNames(): (keyof Events | string | symbol)[]
    
    listeners<E extends keyof Events>(event: E): Events[E][]
    listenerCount<E extends keyof Events>(event: E): number

}