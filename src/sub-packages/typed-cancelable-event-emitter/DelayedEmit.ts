import { EventMap } from "typed-emitter";
import { TypedCancelableEventEmitter } from "./index.ts";

export class DelayedEmit<T extends EventMap> {
    private queued: Function[];
    private emitter: TypedCancelableEventEmitter<T>;
    constructor(emitter: TypedCancelableEventEmitter<T>) {
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
