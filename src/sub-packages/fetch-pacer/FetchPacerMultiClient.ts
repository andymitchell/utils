import type { BackOffResponse, FetchOptionsProvider, FetchPacerOptions, FetchURL } from './types.js';



import FetchPacer from './FetchPacer.js';


/**
 * Proactively rate-limit and retry on server 429s, for smooth request handling. 
 * 
 * Protect the server health
 * - Avoid 429s by applying points to each request, and blocking it if it has exceeded a maximum points/second rate. 
 * 
 * Simplify retry handling 
 * - Optionally automatically retry blocked requests for a time period. 
 */
export default class FetchPacerMultiClient {

    #clients:Record<string, FetchPacer> = {};

    #resourceId: string;
    #options?:FetchPacerOptions;


    /**
     * 
     * @param resourceId A resource is the primary thing you're rate limiting, e.g. the Gmail API 
     * @param options 
     */
    constructor(resourceId: string, options?:FetchPacerOptions) {        
        this.#resourceId = resourceId;
        this.#options = options;
    }

    #getFetchPacer(clientId?:string):FetchPacer {
        if( !clientId ) clientId = 'default'; // Just rely on the resource id 
        if( !this.#clients[clientId] ) {
            this.#clients[clientId] = new FetchPacer(`${this.#resourceId}:${clientId}`, this.#options);
        }
        return this.#clients[clientId]!;
    }

    /**
     * 
     * @param url
     * @param options The request options, or a function building them. Pass a function when
     * anything in them can go stale, as it is called afresh for every attempt.
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @param clientId Track the pace for a given user/device/client id of this resource. (E.g. the Gmail API has a quota of 250 points per user per second... so the resourceId is the Gmail API, and the client id is the user)
     * @returns
     */
    async fetch(url: FetchURL, options?: FetchOptionsProvider, points?: number, clientId?:string): Promise<Response | BackOffResponse> {

        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.fetch(url, options, points);
        
    }


    logPointsManually(points:number, clientId?:string) {
        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.logPointsManually(points);
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
     * @param clientId Which user/device of this resource was refused. Quota is usually counted
     * per client, so one being refused says nothing about the others.
     *
     * @example
     * // A part inside a batch reply came back rate limited for this user
     * await pacer.logBackOff(retryAfterMs, fullUserId);
     */
    async logBackOff(minimumBackOffPeriodMs?:number, clientId?:string):Promise<void> {
        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.logBackOff(minimumBackOffPeriodMs);
    }

    /**
     * How much longer requests for a given client are being held back for.
     *
     * @param clientId Which user/device of this resource to ask about.
     * @returns The remaining wait in milliseconds, or `undefined` when requests are free to go.
     */
    async getActiveBackOffForMs(clientId?:string):Promise<number | undefined> {
        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.getActiveBackOffForMs();
    }
    

    async dispose():Promise<void> {
        const fetchPacers = Object.values(this.#clients);
        for( const fetchPacer of fetchPacers ) {
            await fetchPacer.dispose()
        }
    }

}
