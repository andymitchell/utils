import { MockChromeStorageArea } from "../kv-storage/index.ts";
import { ActivityTrackerBrowserLocal } from "./activity-trackers/ActivityTrackerBrowserLocal.ts";
import FetchPacerMultiClient from "./FetchPacerMultiClient.ts";
import type { BackOffResponse, FetchPacerOptions } from "./types.ts";

/**
 * Answers every request, so any pause seen in these tests came from the pacer's own
 * bookkeeping rather than from the network.
 */
const alwaysAnswers = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

function makeMultiClientForTest():FetchPacerMultiClient {


    const baseConfig:FetchPacerOptions = {
        mode: {
            type: '429_preemptively'
        },
        max_points_per_second: 10,
        back_off_calculation: {type: 'exponential'},
        custom_fetch_function: alwaysAnswers,
        testing_queue_disable_check_timeout: true
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

    beforeEach(() => {
        // Fake timers: makes Date.now() advance deterministically with the
        // scheduled delays, so the timing assertions don't flake under build load.
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * Run a fetch to completion under fake timers, advancing past the default
     * minimum_time_between_fetch gap the queue enforces before each request.
     */
    async function fetchAdvancingTime(fetchPacerMultiClient:FetchPacerMultiClient, points:number, clientId:string):Promise<Response | BackOffResponse> {
        const responsePromise = fetchPacerMultiClient.fetch('https://example.com', undefined, points, clientId);
        await vi.advanceTimersByTimeAsync(200);
        return await responsePromise;
    }


    test(`the same id will correctly back off`, async () => {


        const fetchPacerMultiClient = makeMultiClientForTest();

        const response1 = await fetchAdvancingTime(fetchPacerMultiClient, 5, 'abc');
        const response2 = await fetchAdvancingTime(fetchPacerMultiClient, 5, 'abc');


        expect(response1.status).toBe(200);
        expect(response2.status).toBe(429);
        // 5 of the 10 points/second spent = a 500ms hold, of which 200ms had already
        // passed (the enforced gap between fetches) when the second request was refused.
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(300);

    })

    test(`a different id will not back off`, async () => {

        const fetchPacerMultiClient = makeMultiClientForTest();


        const response1 = await fetchAdvancingTime(fetchPacerMultiClient, 3, 'abc');
        const response2 = await fetchAdvancingTime(fetchPacerMultiClient, 3, 'def');

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(undefined);

    })

})
