
import type { OnceConditionMetResponse, TypedCancel } from "./types.ts";

type MinimumEventEmitter = { on: Function; off: Function };

export class ExtendedEventEmitter {

    #eventEmitter: MinimumEventEmitter;

    constructor(eventEmitter: MinimumEventEmitter) {
        this.#eventEmitter = eventEmitter;
    }


    onCancelable(event: string | number | symbol, listener: Function): TypedCancel {
        this.#eventEmitter.on(event, listener);
        return () => this.#eventEmitter.off(event, listener);
    }

    /**
         * A promise that returns when the event has fired with parameters that fulfil the predicate
         * @param event 
         * @param condition 
         * @param timeoutMs 
         * @param errorOnTimeout 
         * @returns 
         */
    onceConditionMet(event: string | number | symbol, condition: (...args: any[]) => boolean, timeoutMs = 30000, errorOnTimeout = false): Promise<OnceConditionMetResponse> {



        return new Promise((resolve, reject) => {
            const state: { cancel?: TypedCancel, timeout?: ReturnType<typeof setTimeout>, events: any[] } = { events: [] }
            const wrappedListener = (...args: any[]) => {
                state.events.push(args);
                if (condition(...args)) {
                    state.cancel!();
                    clearTimeout(state.timeout!);
                    resolve({ status: 'ok', events: state.events, firstPassParam: args[0] })
                }
            };
            state.cancel = this.onCancelable(event, wrappedListener);
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
    conditionMetAfterTimeout(event: string | number | symbol, condition: (...args: any[]) => boolean, timeoutMs = 30000): Promise<OnceConditionMetResponse> {

        return new Promise((resolve, reject) => {
            const state: { cancel?: TypedCancel, timeout?: ReturnType<typeof setTimeout>, events: any[], last_condition_met?: boolean } = { events: [] }
            const wrappedListener = (...args: any) => {
                state.events.push(args);
                state.last_condition_met = condition(...args);
            };
            state.cancel = this.onCancelable(event, wrappedListener);
            state.timeout = setTimeout(() => {
                state.cancel!();

                if (state.last_condition_met) {
                    resolve({ status: 'ok', events: state.events, firstPassParam: state.events.flat()[0] })
                } else {
                    resolve({ status: 'timeout', events: state.events });
                }
            }, timeoutMs);
        })

    }

}

