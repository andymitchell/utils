
/**
 * User-defined events
 * 
 * @example
 * {
 *  'CLICK': (event: {element:HTMLElement}) => void
 * }
 */
export interface EventMap {
    [key: string]: (...args: any[]) => void
}



/**
 * The event map, including the universal events (like newListener)
 */
export type MergedEventMap<T extends EventMap> = T & BaseEventMap<T>;

/**
 * The universal events provided by the lsistener
 */
interface BaseEventMap<T extends EventMap> {
    newListener: <E extends keyof MergedEventMap<T>>(eventName: E, listener: MergedEventMap<T>[E]) => void;//(...args: any[]) => void) => void;
    removeListener: (eventName: keyof MergedEventMap<T>, listener: (...args: any[]) => void) => void;
}



/**
 * The cancel function for onCancelable
 */
export type TypedCancel = () => void;


export type OnceConditionMetResponse<EParams extends any[] = any> = {
    status: 'ok',
    /**
     * An array of the parameters each time the event fired
     */
    events: EParams[],
    /**
     * For the first event that passes the condition, this is the first parameter. Typically the `event`. 
     */
    firstPassParam: EParams[number]
} | {
    status: 'timeout',
    /**
     * An array of the parameters each time the event fired
     */
    events: EParams[]
    
    firstPassParam?: undefined
}






export interface IEventEmitterExtension<T extends EventMap> {


    onCancelable<E extends keyof MergedEventMap<T>>(event: E, listener: MergedEventMap<T>[E]): TypedCancel;

    /**
         * A promise that returns when the event has fired with parameters that fulfil the predicate
         * @param event 
         * @param condition 
         * @param timeoutMs 
         * @param errorOnTimeout 
         * @returns 
         */
    onceConditionMet<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs?: number, errorOnTimeout?: boolean): Promise<OnceConditionMetResponse<Parameters<T[E]>>>;

    /**
     * Make sure that the final firing of the event, in the time period, has parameters that fulfil the predicate. 
     * 
     * E.g. in testing, to check a view subscription event, it's useful to test the negative case (no view items emitted, []). But if you tried that with onceConditionMet, an earlier firing of the view event might pass (as it has no items), failing to see that it fires again with the items.
     * @param event 
     * @param condition 
     * @param timeoutMs 
     * @returns 
     */
    conditionMetAfterTimeout<E extends keyof T>(event: E, condition: (...args: Parameters<T[E]>) => boolean, timeoutMs?:number): Promise<OnceConditionMetResponse<Parameters<T[E]>>>
}



