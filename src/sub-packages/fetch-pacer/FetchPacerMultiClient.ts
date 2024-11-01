import { BackOffResponse, FetchOptions, FetchPacerOptions, FetchURL } from './types';


import {v4 as uuidv4} from 'uuid';


import FetchPacer from './FetchPacer';

/**
 * Pre-emptively rate limit and handle 429 back offs for multiple resources / multiple users of a resource 
 */
export default class FetchPacerMultiClient {

    #clients:Record<string, FetchPacer> = {};

    #defaultResourceId = uuidv4()
    #options?:FetchPacerOptions;


    constructor(options?:FetchPacerOptions) {        
        this.#options = options;
    }

    #getFetchPacer(resourceId?:string):FetchPacer {
        if( !resourceId ) resourceId = this.#defaultResourceId;
        if( !this.#clients[resourceId] ) {
            this.#clients[resourceId] = new FetchPacer(resourceId, this.#options);
        }
        return this.#clients[resourceId]!;
    }

    /**
     * 
     * @param url 
     * @param options 
     * @param points The number of units this will consume. Used to rate limit if max_points_per_second is defined.
     * @param resourceId Track the pace for a given id (e.g.  for each user of a resource)
     * @returns 
     */
    async fetch(url: FetchURL, options?: FetchOptions, points?: number, resourceId?:string): Promise<Response | BackOffResponse> {

        const fetchPacer = this.#getFetchPacer(resourceId);
        return fetchPacer.fetch(url, options, points);
        
    }
    

    async dispose():Promise<void> {
        const fetchPacers = Object.values(this.#clients);
        for( const fetchPacer of fetchPacers ) {
            await fetchPacer.dispose()
        }
    }

}
