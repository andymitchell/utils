import { MockChromeStorageArea } from "../kv-storage/index.ts";
import { ActivityTrackerBrowserLocal } from "./activity-trackers/ActivityTrackerBrowserLocal.ts";
import FetchPacerMultiClient from "./FetchPacerMultiClient.ts";
import type { BackOffResponse, FetchPacerOptions } from "./types.ts";


function makeMultiClientForTest():FetchPacerMultiClient {
    

    const baseConfig:FetchPacerOptions = {
        mode: {
            type: '429_preemptively'
        },
        max_points_per_second: 5,
        back_off_calculation: {type: 'exponential'}
    }

    const fetchPacerMultiClient = new FetchPacerMultiClient('resource', {
        ...baseConfig,
        storage: {
            type: 'custom', 
            activity_tracker: (id, options) => new ActivityTrackerBrowserLocal(id, options, new MockChromeStorageArea())
        }
    });
    
    return fetchPacerMultiClient;

}

describe('Multiple Clients ', () => {


    test(`the same id will correctly back off`, async () => {
        

        const fetchPacerMultiClient = makeMultiClientForTest();

        const response1 = await fetchPacerMultiClient.fetch('https://example.com', undefined, 3, 'abc');
        const response2 = await fetchPacerMultiClient.fetch('https://example.com', undefined, 3, 'abc'); 
        

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(429);
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(1000);

    })

    test(`a different id will not back off`, async () => {
        
        const fetchPacerMultiClient = makeMultiClientForTest();


        const response1 = await fetchPacerMultiClient.fetch('https://example.com', undefined, 3, 'abc');
        const response2 = await fetchPacerMultiClient.fetch('https://example.com', undefined, 3, 'def'); 

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(undefined);

    })

})