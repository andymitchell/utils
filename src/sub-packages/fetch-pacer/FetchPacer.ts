import type { BackOffResponse, Fetch, FetchOptionsProvider, FetchPacerEvents, FetchPacerOptions, FetchURL, PaceResponse } from './types.js';

import { type IQueue, QueueMemory } from '../queue/index-memory.js';

import { sleep } from '../../main/index.js';
import PaceTracker from './PaceTracker.ts';
import {  TypedCancelableEventEmitter3 } from '../typed-cancelable-event-emitter/index.ts';
import { isBackOffResponse } from './utils/isBackOffResponse.ts';
import { parseRetryAfterMs } from './utils/parseRetryAfterMs.ts';

/**
 * What a pacer uses for any option it is not given: a request that must wait is answered at
 * once with a synthetic 429, sends are at least 200ms apart, and history is kept in memory.
 */
export const fetchPacerOptionsDefault:FetchPacerOptions = {
    mode: {
        type: '429_preemptively'
    },
    // Sends packed closer together have been seen to stall while pending in the network stack.
    minimum_time_between_fetch: 200,
    storage: {
        type: 'memory'
    }
}


/**
 * Sends requests at a pace a rate-limited service will accept, and handles its refusals.
 *
 * Each request states its cost in points. Before sending one, the pacer waits until the last
 * second's spend leaves room for it (`max_points_per_second`), and out any refusal pause in
 * force. Requests go one at a time, in the order they were asked for.
 *
 * What happens to a request that has to wait depends on `mode`. In `429_preemptively` mode it
 * comes back straight away as a synthetic 429 saying how long to wait, without being sent. In
 * `attempt_recovery` mode it is held and sent once it can go, and a request the service refuses
 * is retried the same way, so the caller sees only the final answer. A refusal pauses every
 * request, for as long as the service named or as `back_off_calculation` works out.
 *
 * @example
 * const pacer = new FetchPacer('mail-api:user-1', {
 *     mode: { type: 'attempt_recovery', timeout_ms: 60_000 },
 *     max_points_per_second: 250
 * });
 * const response = await pacer.fetch(url, { method: 'GET' }, 5);
 *
 * @remarks
 * Pacers with the same `id` and the same durable `storage` share one quota and one refusal
 * pause, e.g. across the tabs or workers of an extension.
 */
export default class FetchPacer {
    #queue:IQueue;
    #options:FetchPacerOptions;

    protected paceTracker:PaceTracker;
    #fetchFunction: Fetch;
    /** When this pacer last sent a request; `undefined` until it first does. */
    #lastDispatchTs?: number;

    emitter = new TypedCancelableEventEmitter3<FetchPacerEvents>();

    /**
     * @param id Key for tracking the pace in durable storage. Provide a unique one for each resource (+ user of that resource) you wish to rate-limit.
     * @param options How to pace; anything left out comes from {@link fetchPacerOptionsDefault}.
     */
    constructor(id: string, options?:FetchPacerOptions) {
        this.#queue = new QueueMemory(id, {testing_disable_check_timeout: options?.testing_queue_disable_check_timeout ?? true});
        this.#options = {
            ...fetchPacerOptionsDefault,
            ...options
        }

        this.paceTracker = new PaceTracker(id, options);

        this.#fetchFunction = options?.custom_fetch_function ?? inbuiltFetch;        
    }

    /**
     * Sends a request once the quota and any refusal pause allow it.
     *
     * Requests are sent one at a time, in the order asked for. Each waits at least
     * `minimum_time_between_fetch` after the previous send, then until its points fit the quota.
     *
     * @param url Where to send it.
     * @param options The request options, or a function building them. Pass a function when
     * anything in them can go stale, as it is called afresh for every attempt.
     * @param points What the request costs against `max_points_per_second`. Charged the moment
     * it is sent, and kept whether the service accepts it, refuses it or fails, since it may have
     * been metered either way.
     * @returns The service's response, with `pacing_attempt` attached, plus `back_off_for_ms` if
     * it was a refusal. A request that has to wait is answered instead with a synthetic 429
     * carrying `back_off_for_ms`: at once in `429_preemptively` mode, or in `attempt_recovery`
     * mode only once waiting any longer would pass `timeout_ms` (then with `cannot_recover`).
     * @throws What the underlying fetch throws; or, when the request was sent but its charge
     * could not be stored, that storage failure.
     *
     * @example
     * const response = await pacer.fetch(url, undefined, 5);
     * if( isBackOffResponse(response) ) await sleep(response.back_off_for_ms ?? 0);
     */
    async fetch(url: FetchURL, options?: FetchOptionsProvider, points?: number): Promise<PaceResponse | BackOffResponse> {
        if( this.#options?.max_points_per_second && typeof points!=='number' ) {
            console.debug("FetchPacer request ought to have point stated, as tracking max points / second.", url);
        }
        

        
        try {
            return await this.#queue.enqueue(async (job) => {

                // Let it know things are actively tracked (in case it wishes to optimise / be lazy when its inactive)
                if( !(await this.paceTracker.isActive()) ) {
                    await this.paceTracker.setActive(true);
                }

                // Measured from the previous send, so time already spent waiting (for quota, or
                // out a refusal) counts towards the gap rather than being added to it.
                const gapMs = this.#lastDispatchTs===undefined? 0 : this.#lastDispatchTs + this.#options.minimum_time_between_fetch! - Date.now();
                if( gapMs>0 ) await sleep(gapMs);

                // Built afresh for every attempt, so that a retry landing much later carries a
                // credential that is still valid. Built before the check below, so that anything
                // spent elsewhere while it was being built is counted; an attempt that is then
                // held back has still built its request once.
                const attemptOptions = typeof options==='function'? await options() : options;

                const pauseExceedsMaxTimeout = (pauseForMs:number) => (this.#options.mode.type==='attempt_recovery' && this.#options.mode.timeout_ms && (Date.now()+pauseForMs)>(job.created_at+this.#options.mode.timeout_ms)) as boolean;


                // The last thing awaited before the send, so the answer still holds when it goes.
                const pauseFor = await this.paceTracker.getPauseBeforeMs(points ?? 0);
                if( pauseFor!==undefined ) {
                    let will_retry = false;
                    const response = attachBackOffTimeToResponse(attachAttemptToResponse(createResponse429(), job.attempt), pauseFor);
                    if( this.#options.mode.type==='attempt_recovery' ) {
                        if( pauseExceedsMaxTimeout(pauseFor) ) {
                            response.cannot_recover = true;
                            response.back_off_accumulated_ms = Date.now() - job.created_at;
                        } else {
                            // Tell it to retry
                            will_retry = true;
                            job.preventCompletion(pauseFor);
                        }
                    }

                    this.emitter.emit('BACKING_OFF', {type_of_429: 'synthetic', attempt: response.pacing_attempt, cannot_recover: response.cannot_recover, will_retry})
                    return response
                }

                //if( this.#options?.verbose ) console.log(`Fetching ${url} [ts: ${Date.now()}]`);
                const ff = this.#fetchFunction;

                // Nothing is awaited between here and the send, so the gap and the charge are both
                // dated from the moment the request actually goes, however slow the store is.
                this.#lastDispatchTs = Date.now();
                // Observed from the moment it exists: a store that fails while the response is still
                // on its way must surface through this request, not as an unhandled rejection.
                const chargeFailure: Promise<{ cause: unknown } | undefined> = (points ?? 0)>0
                    ? this.paceTracker.reservePoints(points!).then(() => undefined, (cause: unknown) => ({ cause }))
                    : Promise.resolve(undefined);
                let raw: Response;
                try {
                    raw = await ff(url, attemptOptions);
                } catch(fetchFailure) {
                    // The request's own failure is the one the caller hears. The charge stands
                    // either way, as the request may have reached the service before failing.
                    await chargeFailure;
                    throw fetchFailure;
                }
                // The charge is stored before anything else happens, so the next check counts it.
                const failedCharge = await chargeFailure;
                if( failedCharge ) throw failedCharge.cause;
                const response = attachAttemptToResponse(raw, job.attempt);

                const refusedForPace = await this.#classifyRefusal(response);
                if( refusedForPace ) {
                    // Update the pacer to know it was turned away. A service that named its own
                    // wait is believed over the calculated guess, which can only be shorter.
                    await this.paceTracker.logBackOff(refusedForPace.minimumMs);

                    const pauseFor = await this.paceTracker.getPauseBeforeMs(points ?? 0);

                    let will_retry = false;
                    if( pauseFor!==undefined && pauseFor>0 ) {
                        attachBackOffTimeToResponse(response, pauseFor);

                        // If want to attempt recovery, tell the queue to try again

                        if( this.#options.mode.type==='attempt_recovery' ) {
                            if( pauseExceedsMaxTimeout(pauseFor) ) {
                                response.cannot_recover = true;
                                response.back_off_accumulated_ms = Date.now() - job.created_at;
                            } else {
                                will_retry = true;
                                job.preventCompletion(pauseFor);
                            }
                        }
                    }
                    this.emitter.emit('BACKING_OFF', {type_of_429: 'real', attempt: response.pacing_attempt, cannot_recover: response.cannot_recover, will_retry})

                } else if( response.status>=200 && response.status<=299 ) {
                    // The points were charged as the request went; this marks the success itself,
                    // which ends any run of refusals the back-off counts.
                    await this.paceTracker.logSuccess(0);
                }


                return response;

            });
        } finally {
            // In a `finally`, so that a request that throws still reports the pacer idle once
            // nothing else is queued.
            if( (await this.#queue.count())===0 ) {
                await this.paceTracker.setActive(false);
            }
        }

    }

    /**
     * Decide whether a response means "you are going too fast", and for how long to wait.
     *
     * @returns The refusal and any minimum wait it carries, or `undefined` if the response was
     * not a refusal for pace at all.
     */
    async #classifyRefusal(response: Response): Promise<{ minimumMs?: number } | undefined> {

        const namedWaitMs = parseRetryAfterMs(response.headers.get('Retry-After'));

        // A 429 has already said what it is, leaving a classifier nothing to add.
        if( isBackOffResponse(response) ) return { minimumMs: namedWaitMs };

        const treatAsBackOff = this.#options.treat_as_back_off;
        if( !treatAsBackOff ) return undefined;

        // Cloned so that reading the body to classify it does not consume the caller's copy.
        const verdict = await treatAsBackOff(response.clone());
        if( !verdict ) return undefined;

        const askedForMs = verdict===true? undefined : verdict.minimumMs;
        return { minimumMs: Math.max(namedWaitMs ?? 0, askedForMs ?? 0) || undefined };
    }

    /**
     * Charges spend that did not go through this pacer, so later requests are paced around it.
     *
     * @param points What was spent. It counts against the quota for the next second.
     *
     * @example
     * // A request made outside the pacer spent from the same quota
     * await pacer.logPointsManually(20);
     *
     * @remarks
     * It is recorded as a success, so it also ends any run of refusals: the next refusal gets
     * the first, shortest pause.
     */
    logPointsManually(points:number) {
        return this.paceTracker.logSuccess(points);
    }

    /**
     * Report a refusal this pacer did not carry out itself, so it paces as though it had.
     *
     * Not every request a service refuses passes through here. A batch call spends the cost of
     * many requests in one go, and comes back a success even when individual parts inside it
     * were turned away for going too fast — leaving the pacer with no reason to slow down, and
     * the next batch destined to fare the same. Reporting it closes that gap.
     *
     * @param minimumBackOffPeriodMs The shortest acceptable wait, when the service named one.
     * Omit to let the pacer work the wait out from how often it has been refused lately.
     *
     * @example
     * // A part inside a batch reply came back rate limited
     * await pacer.logBackOff(retryAfterMs);
     */
    async logBackOff(minimumBackOffPeriodMs?: number):Promise<void> {
        return this.paceTracker.logBackOff(minimumBackOffPeriodMs);
    }

    /**
     * How much longer every request is being held back for, whatever it costs.
     *
     * That is the longer of a pause earned by a refusal, and the time until the quota's window
     * is no longer over-full (which only happens after a request larger than the whole quota).
     * A request with a cost can still wait when this is `undefined`, until the window has room
     * for it.
     *
     * @returns The remaining wait in milliseconds, or `undefined` when requests are free to go.
     */
    async getActiveBackOffForMs():Promise<number | undefined> {
        return this.paceTracker.getPauseBeforeMs(0);
    }

    /**
     * Can this points request *ever* be handled, or does it exceed quota (including burst)?
     * 
     * Use it to know you'd have to break up your fetch request, as it'll never succeed. 
     * 
     * **This is guidance only**. It's extremely hard to know what a provider will allow.
     * For example you might use this to _choose_ to break up a batch request into smaller
     * parts; but don't let it stop you ever trying if you can't reduce it. The provider may well
     * let it through. 
     * 
     * @param points The points that you want to consume
     */
    /*
    async possiblyExceedsMaxThroughput(points:number):Promise<boolean> {
        return this.paceTracker.possiblyExceedsMaxThroughput(points);
    }
    */


    /**
     * Releases what the pacer holds. Its recorded history stays in storage, still counted by
     * other pacers sharing it.
     */
    async dispose():Promise<void> {
        await this.paceTracker.dispose();
    }

}

function createResponse429():BackOffResponse {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");

    
    return new Response(JSON.stringify({
        message: "Too Many Requests"
    }), {
        status: 429,
        statusText: "Too Many Requests",
        headers: headers
    }) as BackOffResponse;
}



function attachAttemptToResponse(response: BackOffResponse, attempt: number): BackOffResponse;
function attachAttemptToResponse(response: PaceResponse, attempt: number): PaceResponse;
function attachAttemptToResponse(response: Response, attempt: number): PaceResponse;
function attachAttemptToResponse(response: Response | PaceResponse | BackOffResponse, attempt: number): PaceResponse | BackOffResponse { 
    (response as PaceResponse).pacing_attempt = attempt;
    return response as PaceResponse | BackOffResponse;
}

/**
 * Record how long a refused request is being held back for.
 *
 * Called only where the response has already been established as a refusal for pace, which a
 * service may signal with a status other than 429 — so this does not second-guess the status.
 */
function attachBackOffTimeToResponse<T extends Response | PaceResponse | BackOffResponse>(response:T, backOffMs?: number):T {
    (response as PaceResponse).back_off_for_ms = backOffMs ?? 0;
    return response;
}


const inbuiltFetch:Fetch = typeof self!=='undefined'? self.fetch.bind(self) : (typeof window!=='undefined'? window.fetch.bind(window) : (typeof globalThis!=='undefined'? globalThis.fetch.bind(globalThis) : fetch));