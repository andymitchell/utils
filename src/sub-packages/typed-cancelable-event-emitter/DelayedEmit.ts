import type { TypedCancelableEventEmitter } from "./index.ts";
import type TypedCancelableEventEmitter3 from "./implementations/node/TypedCancelableEventEmitterNode.ts";
import type { EventMap } from "./types.ts";


type AnyTypedCancelableEventEmitter<T extends EventMap> = TypedCancelableEventEmitter<T> | TypedCancelableEventEmitter3<T>;
/**
 * Catches and holds EventEmitter events until flushed.
 * This is useful for situations where you want to delay the emission of events until a certain point,
 * for example, after a transaction has successfully completed.
 *
 * 
 * @template T - A map of event names to their listener signatures.
 */
export class DelayedEmit<T extends EventMap> {
    private queued: Function[];
    private emitter: AnyTypedCancelableEventEmitter<T>;
    constructor(emitter: AnyTypedCancelableEventEmitter<T>) {
        this.queued = [];
        this.emitter = emitter;
    }

    queue<E extends keyof T>(event: E, ...args: Parameters<T[E]>) {
        this.queued.push(() => {
            this.emitter.emit(event, ...args);
        })
    }

    flush() {
        const queued = this.queued;
        this.queued = [];
        queued.forEach(x => x());
    }
}

