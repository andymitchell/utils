import type { EventMap, IEventEmitterExtension } from "../../types.ts"
import type { ITypedEventEmitter3Source } from "../eventemitter3/types.ts"

/**
 * A typed version of node's EventEmitter, extended with helpful functions in IEventEmitterExtension (e.g. onCancelable)
 */
export type ITypedEventEmitterNode<T extends EventMap> = ITypedEventEmitterNodeSource<T> & IEventEmitterExtension<T>;


/**
 * Type-safe event emitter for node's eventemitter
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
export interface ITypedEventEmitterNodeSource<Events extends EventMap> extends ITypedEventEmitter3Source<Events> {
    

    prependListener<E extends keyof Events>(event: E, listener: Events[E]): this
    prependOnceListener<E extends keyof Events>(event: E, listener: Events[E]): this

    rawListeners<E extends keyof Events>(event: E): Events[E][]

    getMaxListeners(): number
    setMaxListeners(maxListeners: number): this
    
}

