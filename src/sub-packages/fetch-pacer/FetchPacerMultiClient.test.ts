import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
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
     * minimum_time_between_fetch gap that follows each request sent.
     */
    async function fetchAdvancingTime(fetchPacerMultiClient:FetchPacerMultiClient, points:number, clientId:string):Promise<Response | BackOffResponse> {
        const responsePromise = fetchPacerMultiClient.fetch('https://example.com', undefined, points, clientId);
        await vi.advanceTimersByTimeAsync(200);
        return await responsePromise;
    }


    test('shares one quota between requests for the same client', async () => {

        const fetchPacerMultiClient = makeMultiClientForTest();

        const response1 = await fetchAdvancingTime(fetchPacerMultiClient, 6, 'abc');
        const response2 = await fetchAdvancingTime(fetchPacerMultiClient, 6, 'abc');

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(429);
        // 6 more on top of 6 would exceed 10 per second until the first 6 leave the window,
        // 1000ms after they were sent; 200ms of that had passed when the second was checked.
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(800);

    })

    test('does not hold a request back after a spend that fits', async () => {

        const fetchPacerMultiClient = makeMultiClientForTest();

        const response1 = await fetchAdvancingTime(fetchPacerMultiClient, 5, 'abc');
        const response2 = await fetchAdvancingTime(fetchPacerMultiClient, 5, 'abc');

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(undefined);

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
