import type { PaceTrackerOptions } from "./pace-tracker-types.ts";

export type {
    ActivityItem,
    ActivityItemBackOff,
    ActivityItemReserved,
    ActivityItemSuccess,
    ActivityTrackerOptions,
    IActivityTracker,
    SetBackOffUntilTsOptions,
    StoredActivityItem,
    StoredActivityItemBackOff,
    StoredActivityItemReserved,
    StoredActivityItemSuccess
} from "./activity-tracker-types.ts";

export type {
    IPaceTracker,
    PaceTrackerOptions,
    QuotaSpend,
    QuotaWindow
} from "./pace-tracker-types.ts";

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
     * What happens to a request the pacer cannot send yet.
     *
     * Once a request has waited out `minimum_time_between_fetch`, it is held back while the
     * quota has no room for it or a refusal pause is in force. A request the service refuses for
     * going too fast (a 429, or see `treat_as_back_off`) is handled the same way.
     */
    mode: {
        /**
         * Answer instead of waiting. A held-back request comes back unsent as a synthetic 429,
         * and a refusal comes back as the service sent it; either carries `back_off_for_ms`,
         * saying how long to wait before trying again. Nothing is retried.
         */
        type: '429_preemptively'
    } | {
        /**
         * Wait and retry, so the caller sees only the final answer, as from a plain fetch.
         *
         * A held-back request, or one the service refuses, is run again once the pause is over.
         * `pacing_attempt` on the answer says which attempt it came from, 0 for the first. Any
         * other answer, such as a 500, reaches the caller as it is.
         *
         * @remarks
         * A refusal whose pause is already over by the time it has been recorded reaches the
         * caller as it is, without a retry.
         */
        type: 'attempt_recovery',
        /**
         * How long a request may keep waiting, in ms from when it was first queued. Unset or 0
         * means no limit.
         *
         * Once waiting any longer would pass it, the latest answer (the service's refusal, or a
         * synthetic 429) goes to the caller marked `cannot_recover`, with `back_off_for_ms` and
         * `back_off_accumulated_ms` set.
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