import type { BackOffResponse, Fetch, FetchOptionsProvider, FetchPacerEvents, FetchPacerOptions, FetchURL, PaceResponse } from './types.js';

import { type IQueue, QueueMemory } from '../queue/index-memory.js';

import { sleep } from '../../main/index.js';
import PaceTracker from './PaceTracker.ts';
import {  TypedCancelableEventEmitter3 } from '../typed-cancelable-event-emitter/index.ts';
import { isBackOffResponse } from './utils/isBackOffResponse.ts';
import { parseRetryAfterMs } from './utils/parseRetryAfterMs.ts';

export const fetchPacerOptionsDefault:FetchPacerOptions = {
    mode: {
        type: '429_preemptively'
    },
    minimum_time_between_fetch: 200, // Sometimes it's clogging pending in network requests, and not sure why. 200 seems to fix it.
    storage: {
        type: 'memory'
    }
}


/**
 * Proactively rate-limit and retry on server 429s, for smooth request handling. 
 * 
 * Protect the server health
 * - Avoid 429s by applying points to each request, and blocking it if it has exceeded a maximum points/second rate. 
 * 
 * Simplify retry handling 
 * - Optionally automatically retry blocked requests for a time period. 
 */
export default class FetchPacer {
    #queue:IQueue;
    #options:FetchPacerOptions;

    protected paceTracker:PaceTracker;
    #fetchFunction: Fetch;

    emitter = new TypedCancelableEventEmitter3<FetchPacerEvents>();

    /**
     * 
     * @param id Key for tracking the pace in durable storage. Provide a unique one for each resource (+ user of that resource) you wish to rate-limit. 
     * @param options 
     */
    constructor(id: string, options?:FetchPacerOptions) {
        this.#queue = new QueueMemory(id, {testing_disable_check_timeout: options?.testing_queue_disable_check_timeout});
        this.#options = {
            ...fetchPacerOptionsDefault,
            ...options
        }

        this.paceTracker = new PaceTracker(id, options);

        this.#fetchFunction = options?.custom_fetch_function ?? inbuiltFetch;        
    }

    /**
     * Run a fetch that will, if necessary, wait before calling over the network in order to not exceed the quota.
     * 
     * @param url
     * @param options The request options, or a function building them. Pass a function when
     * anything in them can go stale, as it is called afresh for every attempt.
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @returns
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

                await sleep(this.#options.minimum_time_between_fetch!);

                const pauseExceedsMaxTimeout = (pauseForMs:number) => (this.#options.mode.type==='attempt_recovery' && this.#options.mode.timeout_ms && (Date.now()+pauseForMs)>(job.created_at+this.#options.mode.timeout_ms)) as boolean;


                const pauseFor = await this.paceTracker.getActiveBackOffForMs();
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

                // Built here, rather than when the request was first asked for, so that a retry
                // landing much later carries a credential that is still valid.
                const attemptOptions = typeof options==='function'? await options() : options;

                const response = attachAttemptToResponse(await ff(url, attemptOptions), job.attempt);

                const refusedForPace = await this.#classifyRefusal(response);
                if( refusedForPace ) {
                    // Update the pacer to know it was turned away. A service that named its own
                    // wait is believed over the calculated guess, which can only be shorter.
                    await this.paceTracker.logBackOff(refusedForPace.minimumMs);

                    const pauseFor = await this.paceTracker.getActiveBackOffForMs();

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
                    // Nb want to log even if no points, because exponential back off needs to know the most recent successful request
                    await this.paceTracker.logSuccess(points ?? 0);
                }


                return response;

            });
        } finally {
            // In a `finally` because a request that throws still leaves tracking switched on,
            // and an active tracker polls on a timer that would then outlive the whole run.
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
     * How much longer requests are being held back for.
     *
     * @returns The remaining wait in milliseconds, or `undefined` when requests are free to go.
     */
    async getActiveBackOffForMs():Promise<number | undefined> {
        return this.paceTracker.getActiveBackOffForMs();
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