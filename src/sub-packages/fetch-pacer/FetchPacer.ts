import type { BackOffResponse, Fetch, FetchOptions, FetchPacerEvents, FetchPacerOptions, FetchURL, PaceResponse } from './types.js';

import { type IQueue, QueueMemory } from '../queue/index-memory.js';

import { sleep } from '../../main/index.js';
import PaceTracker from './PaceTracker.ts';
import {  TypedCancelableEventEmitter3 } from '../typed-cancelable-event-emitter/index.ts';
import { isBackOffResponse } from './utils/isBackOffResponse.ts';

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
        this.#queue = new QueueMemory(id);
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
     * @param options 
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @returns 
     */
    async fetch(url: FetchURL, options?: FetchOptions, points?: number): Promise<PaceResponse | BackOffResponse> {
        if( this.#options?.max_points_per_second && typeof points!=='number' ) {
            console.debug("FetchPacer request ought to have point stated, as tracking max points / second.", url);
        }
        

        
        const response = await this.#queue.enqueue(async (job) => {

            // Let it know things are actively tracked (in case it wishes to optimise / be lazy when its inactive)
            if( !(await this.paceTracker.isActive()) ) {
                this.paceTracker.setActive(true);
            }
            
            await sleep(this.#options.minimum_time_between_fetch!);

            const pauseExceedsMaxTimeout = (pauseForMs:number) => (this.#options.mode.type==='attempt_recovery' && this.#options.mode.timeout_ms && (Date.now()+pauseForMs)>(job.created_at+this.#options.mode.timeout_ms)) as boolean;

            
            const pauseFor = await this.paceTracker.getActiveBackOffForMs();
            if( pauseFor!==undefined ) {
                let will_retry = false;
                const response = attachBackOffTimeToResponse429(attachAttemptToResponse(createResponse429(), job.attempt), pauseFor);
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
            const response = attachAttemptToResponse(await ff(url, options), job.attempt);

            if( isBackOffResponse(response) ) {
                // Update the pacer to know a 429 was issued 
                await this.paceTracker.logBackOff();
                
                const pauseFor = await this.paceTracker.getActiveBackOffForMs();

                let will_retry = false;
                if( pauseFor!==undefined && pauseFor>0 ) {
                    attachBackOffTimeToResponse429(response, pauseFor);

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

        if( (await this.#queue.count())===0 ) {
            this.paceTracker.setActive(false);
        }
    
        return response;

    }

    logPointsManually(points:number) {
        return this.paceTracker.logSuccess(points);
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

function attachBackOffTimeToResponse429<T extends Response | PaceResponse | BackOffResponse>(response:T, backOffMs?: number):T {
    if( response.status===429 ) {
        (response as BackOffResponse).back_off_for_ms = backOffMs ?? 0;
    }
    return response;
}


const inbuiltFetch:Fetch = typeof self!=='undefined'? self.fetch.bind(self) : (typeof window!=='undefined'? window.fetch.bind(window) : (typeof globalThis!=='undefined'? globalThis.fetch.bind(globalThis) : fetch));