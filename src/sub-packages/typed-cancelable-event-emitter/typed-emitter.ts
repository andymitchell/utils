// With thanks to https://github.com/andywer/typed-emitter from which this was taken (but customised to work with EventEmitter3)

export type EventMap = {
    [key: string]: (...args: any[]) => void
}

/**
 * Type-safe event emitter.
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
export interface TypedEventEmitter3<Events extends EventMap> {
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

export interface TypedEventEmitterNode<Events extends EventMap> extends TypedEventEmitter3<Events> {
    

    prependListener<E extends keyof Events>(event: E, listener: Events[E]): this
    prependOnceListener<E extends keyof Events>(event: E, listener: Events[E]): this

    rawListeners<E extends keyof Events>(event: E): Events[E][]

    getMaxListeners(): number
    setMaxListeners(maxListeners: number): this
    
}

