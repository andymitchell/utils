import { BackOffResponse, FetchOptions, FetchPacerOptions, FetchURL } from './types';



import FetchPacer from './FetchPacer';


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
     * @param options 
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @param clientId Track the pace for a given user/device/client id of this resource. (E.g. the Gmail API has a quota of 250 points per user per second... so the resourceId is the Gmail API, and the client id is the user)
     * @returns 
     */
    async fetch(url: FetchURL, options?: FetchOptions, points?: number, clientId?:string): Promise<Response | BackOffResponse> {

        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.fetch(url, options, points);
        
    }


    checkPace(points = 0, trackingID?: string, clientId?:string) {
        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.checkPace(points, trackingID);
    }

    logPointsManually(points:number, clientId?:string) {
        const fetchPacer = this.#getFetchPacer(clientId);
        return fetchPacer.logPointsManually(points);
    }
    

    async dispose():Promise<void> {
        const fetchPacers = Object.values(this.#clients);
        for( const fetchPacer of fetchPacers ) {
            await fetchPacer.dispose()
        }
    }

}
