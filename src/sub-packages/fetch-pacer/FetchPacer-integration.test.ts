

const mockFetch = vi.fn(() => Promise.resolve({ status: 200 }));
global.fetch = mockFetch as unknown as typeof fetch;

// Helper to make mockFetch results cloneable, as Response objects are often cloned.
const mockFetchResponse = (status: number, body: any = null, headers: Record<string, string> = {}) => {
    const response = new Response(body ? JSON.stringify(body) : null, {
        status,
        headers: new Headers(headers),
    });
    return response;
};


import { afterEach, expect, vi } from 'vitest';
import type {  FetchPacerOnlyOptions, FetchPacerOptions, PaceTrackerOptions } from './types.ts';


import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import { MockChromeStorageArea } from '../kv-storage/index.ts';
import { isBackOffResponse } from './utils/isBackOffResponse.ts';
import FetchPacer from './FetchPacer.ts';
import { expectBetweenNumbers } from './testing-utils/expectInRange.ts';
import { settle } from './testing-utils/settle.ts';



// Factory function to create FetchPacer with custom config
function makeTest(optionalTestConfig: Partial<FetchPacerOptions> = {}): FetchPacer {
    const config: FetchPacerOptions = {
        storage: {
            type: 'custom',
            activity_tracker: (id, options) => new ActivityTrackerBrowserLocal(id, options, new MockChromeStorageArea())
        },
        mode: {
            type: '429_preemptively'
        },
        custom_fetch_function: mockFetch as unknown as typeof fetch,
        minimum_time_between_fetch: 0,
        ...optionalTestConfig,
    };
    return new FetchPacer('test', config);
}


// Helper function to reset mocks
beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockRestore();
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);
})

afterEach(() => {
    vi.useRealTimers();
})

function commonTestsForMode(type: FetchPacerOnlyOptions['mode']['type'], pointsPerRequest: number = 12, maxPointsPerSecond: number = 10) {

    function commonTestsPacing(pacingReason: 'synthetic' | 'real') {
        describe(`Pacing (${pacingReason})`, () => {

            

            it('pauses second attempt after first triggers delay', async () => {
                const pacer = makeTest({mode: {type}, max_points_per_second: maxPointsPerSecond});

                if( type==='429_preemptively' ) {
                    if( pacingReason==='synthetic' ) {
                        mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                        await settle(pacer.fetch('https://api.example.com', undefined, pointsPerRequest));
                    } else {
                        mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
                        await settle(pacer.fetch('https://api.example.com'));
                    }

                    mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                    const res = await settle(pacer.fetch('https://api.example.com'));

                    // Expect synthetic 429
                    expect(res.status).toBe(429); if( !isBackOffResponse(res) ) throw new Error("noop - typeguard");
                    if( pacingReason==='synthetic' ) {
                        // The first request was larger than the whole quota, so the window stays over-full until it leaves
                        expectBetweenNumbers(800, 1000, res.back_off_for_ms);
                    } else {
                        expect(res.back_off_for_ms).toBeGreaterThan(100);
                    }
                } else {
                    let expectedMinDuration:number;
                    if( pacingReason==='synthetic' ) {
                        mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                        pacer.fetch('https://api.example.com', undefined, pointsPerRequest);
                        expectedMinDuration = 1000; // The first request is larger than the whole quota, so this one waits for it to leave the window
                    } else {
                        mockFetch.mockResolvedValueOnce(mockFetchResponse(429)).mockResolvedValueOnce(mockFetchResponse(200));
                        // The refused attempt still counts as spent (the service may have metered it), and
                        // being larger than the whole quota, the retry waits for it to leave the window.
                        expectedMinDuration = 1000;
                        //const res = pacer.fetch('https://api.example.com');
                        // Let it pass the 429
                    }

                    const st = Date.now();
                    mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                    const res = await settle(pacer.fetch('https://api.example.com', undefined, pointsPerRequest));

                    expect(res.status).toBe(200);
                    // Prove it had to retry 
                    expect(res.pacing_attempt).toBeGreaterThanOrEqual(1);
                    expectBetweenNumbers(expectedMinDuration, expectedMinDuration+250, Date.now()-st);
                }

            })

        })
    }
    
    commonTestsPacing('synthetic');
    commonTestsPacing('real');

    

}

commonTestsForMode('429_preemptively');
commonTestsForMode('attempt_recovery');

