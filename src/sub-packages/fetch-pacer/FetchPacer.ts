import type { BackingOffEvent, BackOffResponse, Fetch, FetchOptionsProvider, FetchPacerEvents, FetchPacerOptions, FetchURL, PaceResponse } from './types.ts';

import { type IQueue, QueueMemory } from '../queue/index-memory.ts';

import { sleep } from '../../main/index.ts';
import PaceTracker from './PaceTracker.ts';
import {  TypedCancelableEventEmitter3 } from '../typed-cancelable-event-emitter/index.ts';
import { isBackOffResponse } from './utils/isBackOffResponse.ts';
import { parseRetryAfterMs } from './utils/parseRetryAfterMs.ts';

/**
 * A job as the queue hands it over to run: when it was queued, which attempt it is on, and how
 * to ask for another attempt. Derived from the queue's contract, which does not name it.
 */
type QueueJob = Parameters<Parameters<IQueue['enqueue']>[0]>[0];

/**
 * What a pacer uses for any option it is not given: a request still held back after the
 * minimum gap is answered with a synthetic 429, sends are at least 200ms apart, and history is
 * kept in memory.
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
 * Each request states its cost in points, and is sent only when the last second's spend leaves
 * room for it (`max_points_per_second`) and no refusal pause is in force. Requests go one at a
 * time, in the order they were asked for, each at least `minimum_time_between_fetch` after the
 * previous send.
 *
 * What happens to a request still held back once that gap has passed depends on `mode`. In
 * `429_preemptively` mode it comes back as a synthetic 429 saying how long to wait, without
 * being sent. In `attempt_recovery` mode it is held and sent once it can go, and a request the
 * service refuses is retried the same way, so the caller sees only the final answer. A refusal
 * pauses every request for as long as `back_off_calculation` works out, and never for less than
 * a wait the service named.
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
     * Requests are sent one at a time, in the order asked for. Each first waits out the rest of
     * `minimum_time_between_fetch` since the previous send. It goes then if its points fit the
     * quota and no refusal pause is in force; otherwise `mode` decides whether it is answered
     * with a synthetic 429 or held until it can go.
     *
     * @param url Where to send it.
     * @param options The request options, or a function building them. Pass a function when
     * anything in them can go stale, as it is called afresh for every attempt.
     * @param points What the request costs against `max_points_per_second`. Charged the moment
     * it is sent, and kept whether the service accepts it, refuses it or fails, since it may have
     * been metered either way.
     * @returns The service's response, with `pacing_attempt` attached, plus `back_off_for_ms` if
     * it was a refusal. A request held back by the quota or a refusal pause is answered instead
     * with a synthetic 429 carrying `back_off_for_ms`: in `429_preemptively` mode as soon as the
     * minimum gap since the previous send has passed, or in `attempt_recovery` mode only once
     * waiting any longer would pass `timeout_ms` (then with `cannot_recover`).
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
        // A request that states no cost is paced as costing nothing.
        const cost = points ?? 0;

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

                // The last thing awaited before the send, so the answer still holds when it goes.
                const pauseFor = await this.paceTracker.getPauseBeforeMs(cost);
                if( pauseFor!==undefined ) {
                    return this.#holdBack(attachAttemptToResponse(createResponse429(), job.attempt), pauseFor, job, 'synthetic');
                }

                const ff = this.#fetchFunction;

                // Nothing is awaited between here and the send, so the gap and the charge are both
                // dated from the moment the request actually goes, however slow the store is.
                this.#lastDispatchTs = Date.now();
                // Observed from the moment it exists: a store that fails while the response is still
                // on its way must surface through this request, not as an unhandled rejection.
                const chargeFailure: Promise<{ cause: unknown } | undefined> = cost>0
                    ? this.paceTracker.reservePoints(cost).then(() => undefined, (cause: unknown) => ({ cause }))
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
                    // Update the pacer to know it was turned away. A wait the service named is the least
                    // the pause lasts; the calculated pause applies only when it is longer.
                    await this.paceTracker.logBackOff(refusedForPace.minimumMs);
                    return this.#holdBack(response, await this.paceTracker.getPauseBeforeMs(cost), job, 'real');
                }

                if( response.status>=200 && response.status<=299 ) {
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
     * Answers a request that has to wait, and in `attempt_recovery` mode arranges its retry.
     *
     * The response is given `back_off_for_ms`. In `attempt_recovery` mode the queue is told to
     * run the job again once the pause is over, unless waiting that long would pass `timeout_ms`:
     * then the response is marked `cannot_recover` and reaches the caller as the final answer.
     *
     * @param response What the caller would receive: the service's refusal, or a synthetic 429.
     * @param pauseForMs How long the request must wait; `undefined` when it need not.
     * @param job The queued job carrying the request.
     * @param typeOf429 `real` when the service refused the request, `synthetic` when the pacer
     * held it back unsent.
     * @returns The same response, with the hold-back details attached.
     *
     * @remarks
     * `BACKING_OFF` is emitted even when no wait is left, so that every refusal is announced. A
     * refusal with no wait left reaches the caller as it is, without a retry.
     */
    #holdBack<T extends PaceResponse>(response: T, pauseForMs: number | undefined, job: QueueJob, typeOf429: BackingOffEvent['type_of_429']): T {
        let willRetry = false;
        if( pauseForMs!==undefined && pauseForMs>0 ) {
            attachBackOffTimeToResponse(response, pauseForMs);
            if( this.#options.mode.type==='attempt_recovery' ) {
                if( this.#wouldPassTimeout(job, pauseForMs) ) {
                    response.cannot_recover = true;
                    response.back_off_accumulated_ms = Date.now() - job.created_at;
                } else {
                    willRetry = true;
                    job.preventCompletion(pauseForMs);
                }
            }
        }
        this.emitter.emit('BACKING_OFF', {type_of_429: typeOf429, attempt: response.pacing_attempt, cannot_recover: response.cannot_recover, will_retry: willRetry});
        return response;
    }

    /**
     * Whether waiting `pauseForMs` more would take a request past `timeout_ms`, counted from
     * when it was first queued.
     *
     * @param job The queued job carrying the request.
     * @param pauseForMs How long the request must wait before its next attempt.
     * @returns `false` outside `attempt_recovery` mode, and whenever `timeout_ms` is unset or 0,
     * as the pacer then keeps retrying for as long as it takes.
     */
    #wouldPassTimeout(job: QueueJob, pauseForMs: number): boolean {
        const mode = this.#options.mode;
        if( mode.type!=='attempt_recovery' || !mode.timeout_ms ) return false;
        return Date.now() + pauseForMs > job.created_at + mode.timeout_ms;
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