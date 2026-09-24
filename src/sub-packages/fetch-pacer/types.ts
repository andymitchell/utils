import type { ActivityTrackerOptions, IActivityTracker } from "./tracker-types.ts";

export type { ActivityItem, ActivityItemReserved, ActivityItemSuccess, ActivityTrackerOptions, IActivityTracker, IPaceTracker, SetBackOffUntilTsOptions, StoredActivityItem, StoredActivityItemBackOff, StoredActivityItemReserved, StoredActivityItemSuccess } from "./tracker-types.ts";

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
 * A function is called once per attempt, just before the pacer decides whether that attempt may
 * go, so an attempt that is then held back has still called it once.
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
     * The quota: the most points that may be spent within any one second.
     *
     * A request's points count from the moment it is sent until one second later. A request
     * waits only until enough earlier spend has dropped out of that second for it to fit; one
     * larger than the whole quota goes once nothing else is in the window.
     *
     * If omitted, requests are never held back for their cost, only while a refusal pause is
     * in force.
     */
    max_points_per_second?: number;

    /**
     * How long to pause every request after the service refuses one for going too fast.
     *
     * Without it, each refusal pauses for 200ms. A longer wait named by the service
     * (`Retry-After`, or `minimumMs` from `treat_as_back_off`) is always followed.
     */
    back_off_calculation?: {
        /** Start at `initial_back_off_ms`, and double with each refusal until the next success. */
        type: 'exponential',

        /**
         * The pause after the first refusal in a run, in milliseconds. Defaults to 100.
         *
         * Each further refusal before the next success doubles it: from the default, 100, then
         * 200, then 400, and so on.
         *
         * @remarks
         * A longer wait named by the service is still followed, and the pause never grows past
         * `max_single_back_off_ms`.
         */
        initial_back_off_ms?: number,

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



/**
 * A pacer's answer to a request: the service's own response, or a synthetic 429 when the pacer
 * held the request back, with pacing details attached.
 */
export interface PaceResponse extends Response {
    /**
     * The attempt it was on (if running in `attempt_recovery` mode, otherwise always 0).
     *
     * First attempt = 0, then increments.
     */
    pacing_attempt: number

    /**
     * How long, in ms, this request is being held back for.
     *
     * Present only when the request was held back, or turned away for going too fast (which a
     * service may signal with a status other than 429, see `treat_as_back_off`). It is the later
     * of the end of any refusal pause and the moment the quota has room for this request: the
     * earliest the pacer would send it, if nothing else is spent meanwhile.
     */
    back_off_for_ms?: number;

    /** `attempt_recovery` tried too many times and could not make it work. Implies the request may exceed any allowable quota. */
    cannot_recover?: boolean;

    /**
     * The time since the first request started
     */
    back_off_accumulated_ms?: number
}
/** A 429: sent by the service, or made by the pacer in place of a request it held back. */
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

    /**
     * The shortest gap, in ms, between one request being sent and the next. Defaults to 200.
     *
     * Measured from when the previous request was sent, so the very first request goes at once,
     * and time already spent waiting (for quota, or out a refusal) counts towards the gap rather
     * than being added to it.
     *
     * @remarks
     * A pacer sends one request at a time and waits for its answer, so when an answer takes
     * longer than the gap, the next request goes as soon as that answer arrives. Measuring from
     * the answer instead would guarantee idle time after every response, at the cost of repeating
     * waits already served.
     */
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
     * Whether the request queue skips its periodic check for requests that run too long.
     * Defaults to `true`.
     *
     * The pacer never acts on that check's warning, so leaving it on only keeps a timer running,
     * which can hold a script or worker open after its work is done. Set `false` only to observe
     * the warning while debugging.
     */
    testing_queue_disable_check_timeout?: boolean
    

}
/**
 * Everything a pacer can be set up with: the quota, the back-off and where history is kept
 * (shared with its tracker), plus how requests are sent and retried.
 */
export type FetchPacerOptions = PaceTrackerOptions & FetchPacerOnlyOptions;

export type BackingOffEvent = {type_of_429: 'synthetic' | 'real', attempt: number, will_retry?: boolean, cannot_recover?: boolean};
export type FetchPacerEvents = {
    
    BACKING_OFF: (event: BackingOffEvent) => void,
}