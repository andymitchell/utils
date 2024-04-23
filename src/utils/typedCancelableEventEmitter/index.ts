import { EventEmitter } from 'events';
import TypedEmitter, { EventMap } from "typed-emitter";


export type TypedCancel = () => void ;
export class TypedCancelableEventEmitter<T extends EventMap> extends (EventEmitter as { new <U extends EventMap>(): TypedEmitter<U> })<T> {
    onCancelable<E extends keyof T>(event: E, listener: T[E]): TypedCancel {
        this.on(event, listener);
        return () => this.off(event, listener);
    }

    onceConditionMet<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000, errorOnTimeout = false): Promise<{status: 'success' | 'timeout', events: Parameters<T[E]>[]}> {
        return new Promise((resolve, reject) => {
            const state:{cancel?:TypedCancel, timeout?: ReturnType<typeof setTimeout>, events: Parameters<T[E]>[]} = {events: []}
            const wrappedListener = (...args:Parameters<T[E]>) => {
                state.events.push(args);
                if( condition(...args) ) {
                    state.cancel!();
                    clearTimeout(state.timeout!);
                    resolve({status: 'success', events: state.events})
                }
            };
            state.cancel = this.onCancelable(event, wrappedListener as T[E]);
            state.timeout = setTimeout(() => {
                state.cancel!();
                
                if( errorOnTimeout ) {
                    reject(`onceConditionMet ${event.toString()} timeout. Did not achieve condition: ${condition.toString()}`)
                } else {
                    resolve({status: 'timeout', events: state.events});
                }
            }, timeoutMs);
        })
        
    }
}

