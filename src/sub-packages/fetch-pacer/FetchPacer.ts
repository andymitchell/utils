import { BackOffResponse,  Fetch, FetchOptions, FetchPacerOptions, FetchURL } from './types.js';

import { IQueue, QueueMemory } from '../queue/index-memory.js';

import { sleep } from '../../main/index.js';
import PaceTracker from './PaceTracker.js';

export const fetchPacerOptionsDefault:FetchPacerOptions = {
    mode: {
        type: '429_preemptively'
    },
    minimum_time_between_fetch: 200, // Sometimes it's clogging pending in network requests, and not sure why. 200 seems to fix it.
    hail_mary_after_many_failures: true,
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

    #paceTracker:PaceTracker;
    #fetchFunction: Fetch;

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

        this.#paceTracker = new PaceTracker(id, options);

        this.#fetchFunction = options?.custom_fetch_function ?? inbuiltFetch;        
    }

    /**
     * 
     * @param url 
     * @param options 
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @returns 
     */
    async fetch(url: FetchURL, options?: FetchOptions, points?: number): Promise<Response | BackOffResponse> {
        if( this.#options?.max_points_per_second && typeof points!=='number' ) {
            console.debug("FetchPacer request ought to have point stated, as tracking max points / second.", url);
        }
        

        // Let it know things are actively tracked (in case it wishes to optimise / be lazy when its inactive)
        this.#paceTracker.setActive(true);
        
        const response = this.#queue.enqueue(async (job) => {
            await sleep(this.#options.minimum_time_between_fetch!);

            const pauseExceedsMaxTimeout = (pauseForMs:number) => (this.#options.mode.type==='attempt_recovery' && this.#options.mode.timeout_ms && (Date.now()+pauseForMs)>(job.created_at+this.#options.mode.timeout_ms)) as boolean;

            const pace = await this.#paceTracker.checkPace(points ?? 0, job.id);
            if( pace.too_fast ) {
                if( this.#options.mode.type==='attempt_recovery' && !pauseExceedsMaxTimeout(pace.pause_for) ) {
                    // Tell it to retry 
                    job.preventCompletion(pace.pause_for);
                }
                return attachBackOffTimeToResponse429(createResponse429(), pace.pause_for);
            }

            if( this.#options?.verbose ) console.log(`Fetching ${url} [ts: ${Date.now()}]`);
            const ff = this.#fetchFunction;
            const response = await ff(url, options);

            if( this.#options?.back_off_calculation && response.status===429 ) {
                // Update the pacer to know a 429 was issued 
                await this.#paceTracker.logBackOffResponse();
                
                const pace = await this.#paceTracker.checkPace(points ?? 0, job.id);
                attachBackOffTimeToResponse429(response, pace.pause_for);

                // If want to attempt recovery, tell the queue to try again 
                if( this.#options.mode.type==='attempt_recovery' ) {
                    if( !pauseExceedsMaxTimeout(pace.pause_for) ) {
                        job.preventCompletion(pace.pause_for);
                    }
                }

            } else {
                // Nb want to log even if no points, because exponential back off needs to know the most recent successful request 
                await this.#paceTracker.logPoints(points ?? 0);
            }

            

            return response;
        
        });

        if( (await this.#queue.count())===0 ) {
            this.#paceTracker.setActive(false);
        }

        return response;

    }

    checkPace(points = 0, trackingID?: string) {
        return this.#paceTracker.checkPace(points, trackingID);
    }
    logPointsManually(points:number) {
        return this.#paceTracker.logPoints(points);
    }
    
    async dispose():Promise<void> {
        await this.#paceTracker.dispose();
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

function attachBackOffTimeToResponse429(response:Response, backOffMs: number):Response {
    if( response.status===429 ) {
        (response as BackOffResponse).back_off_for_ms = backOffMs;
    }
    return response;
}

const inbuiltFetch:Fetch = typeof self!=='undefined'? self.fetch.bind(self) : (typeof window!=='undefined'? window.fetch.bind(window) : (typeof globalThis!=='undefined'? globalThis.fetch.bind(globalThis) : fetch));