import { EventEmitter } from 'events'; // events is installed as a dependency, not just relying on node. 

import TypedEmitter, { EventMap } from "typed-emitter";

// FYI could use eventemitter3 as isomorphic option, but its EventEmitter lacks setMaxListeners (because it has no limit), so would need TypedCancelableEventEmitter to implmenet the function as a placeholder, to satisfy TypedEmitter. 

interface BaseEventMap<T extends EventMap> {
    newListener: (eventName: keyof MergedEventMap<T>, listener: (...args: any[]) => void) => void;
    removeListener: (eventName: keyof MergedEventMap<T>, listener: (...args: any[]) => void) => void;
}
type MergedEventMap<T extends EventMap> = T & BaseEventMap<T>;



export type TypedCancel = () => void;
export class TypedCancelableEventEmitter<T extends EventMap> extends (EventEmitter as { new <U extends EventMap>(): TypedEmitter<U> })<MergedEventMap<T>> {
    onCancelable<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): TypedCancel {
        this.on(event, listener);
        return () => this.off(event, listener);
    }

    /**
     * A promise that returns when the event has fired with parameters that fulfil the predicate
     * @param event 
     * @param condition 
     * @param timeoutMs 
     * @param errorOnTimeout 
     * @returns 
     */
    onceConditionMet<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000, errorOnTimeout = false): Promise<{ status: 'ok' | 'timeout', events: Parameters<T[E]>[] }> {
        return new Promise((resolve, reject) => {
            const state: { cancel?: TypedCancel, timeout?: ReturnType<typeof setTimeout>, events: Parameters<T[E]>[] } = { events: [] }
            const wrappedListener = (...args: Parameters<T[E]>) => {
                state.events.push(args);
                if (condition(...args)) {
                    state.cancel!();
                    clearTimeout(state.timeout!);
                    resolve({ status: 'ok', events: state.events })
                }
            };
            state.cancel = this.onCancelable(event, wrappedListener as MergedEventMap<T>[E]);
            state.timeout = setTimeout(() => {
                state.cancel!();

                if (errorOnTimeout) {
                    reject(`onceConditionMet ${event.toString()} timeout. Did not achieve condition: ${condition.toString()}`)
                } else {
                    resolve({ status: 'timeout', events: state.events });
                }
            }, timeoutMs);
        })

    }

    /**
     * Make sure that the final firing of the event, in the time period, has parameters that fulfil the predicate. 
     * 
     * E.g. in testing, to check a view subscription event, it's useful to test the negative case (no view items emitted, []). But if you tried that with onceConditionMet, an earlier firing of the view event might pass (as it has no items), failing to see that it fires again with the items.
     * @param event 
     * @param condition 
     * @param timeoutMs 
     * @returns 
     */
    conditionMetAfterTimeout<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs = 30000): Promise<{ status: 'ok' | 'fail', events: Parameters<T[E]>[] }> {

        return new Promise((resolve, reject) => {
            const state: { cancel?: TypedCancel, timeout?: ReturnType<typeof setTimeout>, events: Parameters<T[E]>[], last_condition_met?: boolean } = { events: [] }
            const wrappedListener = (...args: Parameters<T[E]>) => {
                state.events.push(args);
                state.last_condition_met = condition(...args);
            };
            state.cancel = this.onCancelable(event, wrappedListener as MergedEventMap<T>[E]);
            state.timeout = setTimeout(() => {
                state.cancel!();

                if (state.last_condition_met) {
                    resolve({ status: 'ok', events: state.events })
                } else {
                    resolve({ status: 'fail', events: state.events });
                }
            }, timeoutMs);
        })

    }
}
