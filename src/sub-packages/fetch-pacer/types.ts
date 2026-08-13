export type ActivityItemSuccess = {
    type: 'success';
    timestamp: number;
    points: number;
}
type ActivityItemBackOff = {
    type: 'back_off',
    timestamp: number;
    force_back_off_until_at_least_ts?: number
}
export type ActivityItem = ActivityItemSuccess | ActivityItemBackOff;

type BaseStoredActivityItem = {
    id: string;
}
export type StoredActivityItemSuccess = ActivityItemSuccess & BaseStoredActivityItem;
export type StoredActivityItemBackOff = ActivityItemBackOff & BaseStoredActivityItem;

export type StoredActivityItem = StoredActivityItemSuccess | StoredActivityItemBackOff;

export type Fetch = typeof fetch;

export type FetchURL = RequestInfo | URL;
export type FetchOptions = RequestInit;

/**
 * The options for a request, or a function that builds them when each attempt is about to run.
 *
 * A held-back request may be retried long after it was first asked for. Anything inside the
 * options that goes stale in the meantime — an access token, an abort signal that has already
 * fired — has to be made again at that point rather than replayed, so pass a function whenever
 * the options are not simply constant.
 *
 * @example
 * // Constant options: fine as a plain object
 * pacer.fetch(url, { method: 'GET' });
 *
 * // A credential that may expire before the retry happens
 * pacer.fetch(url, async () => ({
 *     headers: { Authorization: `Bearer ${await getAccessToken()}` },
 *     signal: AbortSignal.timeout(30_000)
 * }));
 */
export type FetchOptionsProvider = FetchOptions | (() => FetchOptions | Promise<FetchOptions>);

export type PaceTrackerOptions = {
    /**
     * Used by the pacing calculation.
     * 
     * If omitted there will be no pacing. 
     */
    max_points_per_second?: number;

    /**
     * How to calculate the pacing impact of a backoff 429 from the server
     */
    back_off_calculation?: {
        type: 'exponential',

        /**
         * Vary each calculated pause by up to a fifth, either side of its calculated length.
         *
         * Clients that back off at the same moment otherwise return at the same moment, and
         * hit the service with the very burst the back-off existed to break up. Varying the
         * pause staggers their return.
         *
         * @remarks
         * The variation runs in both directions, so across many clients the average wait is
         * still the calculated one. It never applies to a pause the service named itself
         * (see `logBackOff`'s minimum period), which is followed exactly.
         */
        jitter?: boolean,

        /**
         * The longest single pause that may be asked for, in milliseconds. Defaults to 5 minutes.
         *
         * Exponential growth reaches unhelpful lengths quickly once a service keeps refusing;
         * this is the point past which waiting longer stops being useful.
         */
        max_single_back_off_ms?: number
    },

    /**
     * Where point-usage is stored.
     * 
     * Use more durable storage to
     * - Track pace in volatile environments (like a service worker)
     * - Track pace across multiple clients 
     */
    storage?: {
        type: 'memory'
    } | {
        type: 'browser-local'
    } | {
        type: 'custom',
        activity_tracker: (id: string, options?: ActivityTrackerOptions) => IActivityTracker
    }

}



export interface PaceResponse extends Response {
    /**
     * The attempt it was on (if running in `attempt_recovery` mode, otherwise always 0).
     *
     * First attempt = 0, then increments.
     */
    pacing_attempt: number

    /**
     * The calculated/suggested time to back off for.
     *
     * Only present when the request was turned away for going too fast, which a service may
     * signal with a status other than 429 (see `treat_as_back_off`).
     */
    back_off_for_ms?: number;

    /** `attempt_recovery` tried too many times and could not make it work. Implies the request may exceed any allowable quota. */
    cannot_recover?: boolean;

    /**
     * The time since the first request started
     */
    back_off_accumulated_ms?: number
}
export interface BackOffResponse extends PaceResponse {
    status: 429;
    statusText: "Too Many Requests";
}

/**
 * Options specifically for FetchPacer (not PaceTracker)
 */
export type FetchPacerOnlyOptions = {

    /**
     * By default it uses globalThis.fetch. This can change it.
     */
    custom_fetch_function?: Fetch,

    minimum_time_between_fetch?: number,

    /**
     * Decide whether a response that is not a 429 was nonetheless a refusal for going too fast.
     *
     * Not every service says "429" when it means it. Some reply `403` and explain the real
     * reason in the body, where it is indistinguishable from an ordinary permission failure
     * without looking. Treating those as hard errors means never backing off, and so being
     * refused again immediately; treating every `403` as a rate limit means waiting out
     * failures that waiting cannot fix. This tells the pacer which is which.
     *
     * @param response A clone of the response, so reading the body here does not consume the
     * one handed back to the caller.
     * @returns `true` to back off for a period the pacer works out, `{minimumMs}` to back off
     * for at least that long, or `false` to treat the response as it appears.
     *
     * @example
     * treat_as_back_off: async (response) => {
     *     if( response.status!==403 ) return false;
     *     const body = await response.json();
     *     return body?.error?.status==='RESOURCE_EXHAUSTED';
     * }
     *
     * @remarks
     * A 429 never reaches this, having already said what it is; nor does a response arriving
     * while the pacer is holding requests back of its own accord.
     *
     * The response's own status is left untouched, so a caller still sees what the service
     * actually sent and can report it accurately.
     *
     * A `Retry-After` header is honoured whichever way this answers, and wins over a shorter
     * `minimumMs`. Throwing from here fails the request rather than being swallowed, since a
     * classifier that silently stops working would disable rate-limit detection unnoticed.
     */
    treat_as_back_off?: (response: Response) => Promise<boolean | { minimumMs?: number }>,


    /**
     * Define strategy for requests that are hitting the rate limit 
     */
    mode: {
        /**
         * Preemptive rate limiting mode. Checks current pace to avoid server strain by simulating a 429 response before a fetch attempt.
         * @type {'429_preemptively'}
         */
        type: '429_preemptively'
    } | {
        /**
         * Recovery mode with silent retries, behaving like a regular fetch to the caller.
         * @type {'attempt_recovery'}
         */
        type: 'attempt_recovery',
        /**
         * The period it will attempt to recover for before finally giving up 
         */
        timeout_ms?: number
    }


    
    /**
     * Control the `QueueConstructorOptions.testing_disable_check_timeout` settings 
     */
    testing_queue_disable_check_timeout?: boolean
    

}
export type FetchPacerOptions = PaceTrackerOptions & FetchPacerOnlyOptions;


export type CheckPaceResponse = { too_fast: boolean, pause_for: number, points_in_last_second?: number };

export type SetBackOffUntilTsOptions = {
    /**
     * Only set the value if it exceeds the current value 
     */
    onlyIfExceedsCurrentTs?: boolean
}

export interface IActivityTracker {
    /**
     * Adds an activity item (success or backoff)
     * @param activity 
     */
    add(activity: ActivityItem): Promise<void>;

    /**
     * Activates or deactivates polling/processing.
     * @param active 
     */
    setActive(active: boolean): Promise<void>;

    isActive():Promise<boolean>;

    /**
     * Set the time it's backing off until
     * @param ts 
     * @param options 
     */
    setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void>;

    getBackOffUntilTs(): Promise<number | undefined>;


    list(): Promise<StoredActivityItem[]>

    /**
     * Disposes resources and removes event listeners.
     */
    dispose(): Promise<void>;
}

export type ActivityTrackerOptions = {
    clear_activities_older_than_ms?: number
}



export interface IPaceTracker {
    /**
     * Returns the timestamp (in ms) until which fetching is currently paused.
     * A future timestamp if pacing is active, or `undefined` if no pause is set.
     */
    getActiveBackOffUntilTs(): Promise<number | undefined>;

    /**
     * Returns the period (in ms) for which fetching is currently paused.
     * The milliseconds until fetching can run again, or `undefined`.
     */
    getActiveBackOffForMs(): Promise<number | undefined>;

    /**
     * Logs a successful request and updates the pacing cooldown.
     * @param points The cost of the successful request, in points.
     */
    logSuccess(points: number): Promise<void>;

    /**
     * Logs a server-side 429 error and applies an exponential backoff cooldown.
     * @param minimumBackOffPeriodMs Optional minimum backoff period in ms.
     */
    logBackOff(minimumBackOffPeriodMs?: number): Promise<void>;

    /**
     * Enable or disable pacing altogether.
     * @param active `true` to enable, `false` to disable.
     */
    setActive(active: boolean): Promise<void>;

    isActive(): Promise<boolean>;

    /**
     * Clean up any resources (e.g. storage handles).
     */
    dispose(): Promise<void>;
}


export type BackingOffEvent = {type_of_429: 'synthetic' | 'real', attempt: number, will_retry?: boolean, cannot_recover?: boolean};
export type FetchPacerEvents = {
    
    BACKING_OFF: (event: BackingOffEvent) => void,
}