import { MockPaceTracker } from './testing-utils/MockPaceTracker.ts';

vi.mock('./PaceTracker.ts', () => {


    return {
        __esModule: true,
        default: MockPaceTracker
    }
});


let mockFetch = vi.fn<typeof fetch>(() => Promise.resolve(mockFetchResponse(200)));
global.fetch = mockFetch;

// Helper to make mockFetch results cloneable, as Response objects are often cloned.
const mockFetchResponse = (status: number, body: any = null, headers: Record<string, string> = {}) => {
    const response = new Response(body ? JSON.stringify(body) : null, {
        status,
        headers: new Headers(headers),
    });
    return response;
};

import { expect, vi, it } from 'vitest';
import FetchPacer from './FetchPacer.ts';
import type { BackingOffEvent, BackOffResponse, FetchPacerOnlyOptions, FetchPacerOptions, PaceTrackerOptions } from './types.ts';


import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import { MockChromeStorageArea } from '../kv-storage/index.ts';
import { FetchPacerForTesting } from './testing-utils/FetchPacerForTesting.ts';
import { isBackOffResponse } from './utils/isBackoffResponse.ts';
import { promiseWithTrigger, sleep } from '../../index.ts';
import { expectBetweenNumbers, expectBoundGreaterThan, expectCloseTo } from './testing-utils/expectInRange.ts';










// Factory function to create FetchPacer with custom config
function makeTest(optionalTestConfig: Partial<FetchPacerOptions> = {}): FetchPacerForTesting {
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
    return new FetchPacerForTesting('test', config);
}

function makeTestPreemptiveMode(optionalTestConfig: Partial<FetchPacerOptions> = {}): FetchPacerForTesting {
    optionalTestConfig = {
        mode: {
            type: '429_preemptively'
        },
        ...optionalTestConfig

    }

    return makeTest(optionalTestConfig);
}

function makeTestRecoveryMode(optionalTestConfig: Partial<FetchPacerOptions> = {}): FetchPacerForTesting {
    optionalTestConfig = {
        mode: {
            type: 'attempt_recovery'
        },
        ...optionalTestConfig

    }

    return makeTest(optionalTestConfig);
}




// Helper function to reset mocks

beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockRestore();
    mockFetch.mockReset();
    mockFetch = vi.fn<typeof fetch>(() => Promise.resolve(mockFetchResponse(200)));
    global.fetch = mockFetch;
    vi.clearAllMocks();
    //vi.resetModules();
    vi.useRealTimers();


})

afterEach(() => {
    vi.useRealTimers(); // Ensure real timers are restored if a test used fake ones
});

const pointsPeriod = 1000;




function commonTestsForMode(type: FetchPacerOnlyOptions['mode']['type']) {

    function commonFirstRequestTests(optionalTestConfig: Partial<FetchPacerOptions> = {}) {

        it(`always lets first request through`, async () => {
            const pacer = makeTest({ mode: { type }, ...optionalTestConfig });

            mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));


            const res = await pacer.fetch('https://api.example.com');

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);

        })

        it('executes fetch if server does not 429, and logs success', async () => {
            const pacer = makeTest({ mode: { type }, ...optionalTestConfig }); 
            const mockPaceTracker = pacer.getMockPaceTracker();
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200));

            await pacer.fetch('url1');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockPaceTracker.logSuccess).toHaveBeenCalledWith(0); // Default points
        });

        it('executes fetch, and if server does 429, and logs back off', async () => {
            const pacer = makeTest({ mode: { type }, ...optionalTestConfig }); 
            const mockPaceTracker = pacer.getMockPaceTracker();
            mockFetch.mockResolvedValueOnce(mockFetchResponse(429));

            await pacer.fetch('url1');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockPaceTracker.logBackOff).toHaveBeenCalledTimes(1);
        });

    
        it('Non 429/2xx neither logs success nor back off, and returns', async () => {
            const pacer = makeTest({ mode: { type }, ...optionalTestConfig });

            mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
            const res = await pacer.fetch('https://api.example.com');

            expect(res.status).toBe(404);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(pacer.getMockPaceTracker().logSuccess).toHaveBeenCalledTimes(0);
            expect(pacer.getMockPaceTracker().logBackOff).toHaveBeenCalledTimes(0);
        })
    
    }

    function commonPacingTests(optionalTestConfig: Partial<FetchPacerOptions> = {}) {
        describe(`Pacing`, () => {

            /*
            async function runFirstRequestToTriggerDelay(pacer:FetchPacerForTesting, reason: 'synthetic' | 'real') {
                const backOffFor = 100;
                const backOffUntilTs = Date.now()+backOffFor;
                if( reason==='real' ) {
                    mockFetch.mockResolvedValueOnce(mockFetchResponse(429));
                    pacer.getMockPaceTracker().logBackOff.mockImplementationOnce(async () => {
                        console.log("Set delay into future");
                        pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockImplementationOnce(async () => {
                            console.log("Calling next backoff time on 429 track");
                            return backOffUntilTs
                        })
                        mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                        console.log("Set delay into future OK");
                        return backOffFor;
                    })
                } else {
                    // It will log the successful request and consume points (simulated in this case by just immediately setting the getActiveBackOffUntilTs with a delay)
                    pacer.getMockPaceTracker().logSuccess.mockImplementationOnce(async () => {
                        pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockImplementationOnce(async () => {
                            console.log("Calling next backoff time on synth track");
                            return backOffUntilTs
                        })
                    })
                }
                const firstDelayFired = pacer.emitter.onceConditionMet('BACKING_OFF', () => true);
                pacer.fetch('setup-the-first-backoff-delay');
                await firstDelayFired;
                mockFetch.mockReset();
            }
            */

            it('pauses second attempt after first triggers delay', async (cx) => {

                const pacer = makeTest({ mode: { type }, ...optionalTestConfig });

                vi.setSystemTime(0); // Date.now() is now frozen (not ticking forward)

                // Set Pace Tracker up to state it would be after something triggered a delay
                pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockImplementationOnce(async () => Date.now()+100);
                
                if (type === '429_preemptively') {
                    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
                    const res = await pacer.fetch('https://api.example.com');

                    // Expect synthetic 429
                    expect(res.status).toBe(429); if (!isBackOffResponse(res)) throw new Error("noop - typeguard");
                    expect(res.back_off_for_ms).toBeGreaterThanOrEqual(100);
                    expect(mockFetch).toHaveBeenCalledTimes(0);

                    vi.setSystemTime(Date.now() + 100); // Skip forward so it runs

                    // Expect it runs on second attempt
                    const res2 = await pacer.fetch('https://api.example.com');
                    expect(res2.status).toBe(200);
                    expect(mockFetch).toHaveBeenCalledTimes(1);

                } else {
                    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
                    
                    console.log("OK ITS YOU")
                    const res = await pacer.fetch('https://api.example.com');
                    console.log("OK ITS DONE!")

                    expect(res.status).toBe(200);
                    expect(mockFetch).toHaveBeenCalledTimes(1);
                    expect(res.pacing_attempt).toBe(1); // Starts at 0, so 1 means it ran twice

                }



            })

            it('runs second attempt if delay triggered in first attempt has expired', async (cx) => {

                const pacer = makeTest({ mode: { type }, ...optionalTestConfig });

                vi.setSystemTime(0); // Date.now() is now frozen (not ticking forward)

                // Set Pace Tracker up to state it would be after something triggered a delay
                pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now()+100);

                vi.setSystemTime(100); // Skip forward so it runs

                mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
                const res = await pacer.fetch('https://api.example.com');

                expect(res.status).toBe(200);
                expect(mockFetch).toHaveBeenCalledTimes(1);


                if (type === 'attempt_recovery') {
                    expect(res.pacing_attempt).toBe(0); // Starts at 0, so 0 means it ran first time 
                }



            })


        })
    }

    describe(`${type}`, () => {
        
        commonFirstRequestTests({max_points_per_second: 10});

        it(`always lets first request through, even if bigger than max/second`, async () => {
            const pacer = makeTest({ mode: { type }, max_points_per_second: 1 });

            mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

            const res = await pacer.fetch('https://api.example.com', undefined, 10);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);

        })

        commonPacingTests({max_points_per_second: 10});

        

        describe('Concurrent calls', () => {
            it('processes multiple concurrent requests sequentially respecting minimum_time_between_fetch', async () => {
                const min = 30;
                const pacer = makeTest({ mode: { type }, minimum_time_between_fetch: min });
                const mockPaceTracker = pacer.getMockPaceTracker();
                mockPaceTracker.getActiveBackOffForMs.mockResolvedValue(undefined); // No PaceTracker delay

                const fetches: { url: string, ts: number, ms: number }[] = [];
                const st = Date.now();
                mockFetch.mockImplementation(async (url) => {
                    fetches.push({ url: url as string, ts: Date.now(), ms: Date.now()-st });
                    return mockFetchResponse(200);
                });

                pacer.fetch('url1');
                pacer.fetch('url2');
                await pacer.fetch('url3');

                expect(fetches.map(x => x.url)).toEqual(['url1', 'url2', 'url3']);
                

                expectBoundGreaterThan(min*1, fetches[0]!.ms, 20);
                expectBoundGreaterThan(min*2, fetches[1]!.ms, 20);
                expectBoundGreaterThan(min*3, fetches[2]!.ms, 20);
                

            });

        });

        describe('setActive calls', () => {
            it('calls paceTracker.setActive(true) on first fetch and setActive(false) when queue is empty', async () => {
                const pacer = makeTest({ mode: { type } });
                const mockPaceTracker = pacer.getMockPaceTracker();

                expect(mockPaceTracker.setActive).not.toHaveBeenCalled();

                await pacer.fetch('url1');


                // After the queue is empty
                expect(mockPaceTracker.setActive).toHaveBeenCalledWith(true);
                expect(mockPaceTracker.setActive).toHaveBeenCalledWith(false);
                expect(mockPaceTracker.setActive).toHaveBeenCalledTimes(2);
            });

            it('calls setActive(false) only once after multiple concurrent fetches complete', async (cx) => {
                const pacer = makeTest({ mode: { type } });
                const mockPaceTracker = pacer.getMockPaceTracker();

                mockFetch.mockImplementation(async () => {
                    await sleep(10); // Simulate some work
                    return mockFetchResponse(200);
                });

                const p1 = pacer.fetch('url1');
                const p2 = pacer.fetch('url2');

                await sleep(10); // TODO Emit when a job starts in FetchPacer, so can wait for that and drop this 

                expect(mockPaceTracker.setActive).toHaveBeenCalledWith(true);
                const initialTrueCalls = mockPaceTracker.setActive.mock.calls.filter(call => call[0] === true).length;
                expect(initialTrueCalls).toBe(1); // Should still be one true call

                await Promise.all([p1, p2]);

                expect(mockPaceTracker.setActive).toHaveBeenCalledWith(false);
                const finalFalseCalls = mockPaceTracker.setActive.mock.calls.filter(call => call[0] === false).length;
                expect(finalFalseCalls).toBe(1);
            });
        });

        describe('logSuccess points argument', () => {
            it('logs 0 points if fetch called with no points argument', async () => {
                const pacer = makeTest({ mode: { type }, max_points_per_second: 10 }); // max_points_per_second to ensure points are relevant
                const mockPaceTracker = pacer.getMockPaceTracker();
                mockFetch.mockResolvedValueOnce(mockFetchResponse(200));

                await pacer.fetch('url1');
                expect(mockPaceTracker.logSuccess).toHaveBeenCalledWith(0);
            });

            it('logs specified points if fetch called with points argument', async () => {
                const pacer = makeTest({ mode: { type }, max_points_per_second: 10 });
                const mockPaceTracker = pacer.getMockPaceTracker();
                mockFetch.mockResolvedValueOnce(mockFetchResponse(200));

                await pacer.fetch('url1', undefined, 5);
                expect(mockPaceTracker.logSuccess).toHaveBeenCalledWith(5);
            });
        });

        describe('BACKING_OFF event', () => {


            async function commonBackOffTestForFirstResponse(type_of_429: 'synthetic' | 'real', optionalTestConfig: Partial<FetchPacerOptions> = {}) {
                vi.setSystemTime(0);
                
                const pacer = makeTest({ mode: { type }, ...optionalTestConfig});

                pacer.getMockPaceTracker().logBackOff.mockImplementation(async () => {
                    pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now()+100); // Set it to pause and thus retry 
                });

                if( type_of_429==='real' ) {
                    mockFetch.mockResolvedValue(mockFetchResponse(429));
                } else {
                    pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValue(Date.now()+100);
                }

                const resultPromise = pacer.emitter.onceConditionMet('BACKING_OFF', (event) => true, 500);
                pacer.fetch('url1');
                const event = (await resultPromise).firstPassParam;
                expect(event?.type_of_429).toBe(type_of_429);
                expect(event?.attempt).toBe(0);
                expect(event?.cannot_recover).toBeFalsy();

                if( type==='attempt_recovery' ) {
                    expect(event?.will_retry).toBe(true);
                } else {
                    expect(event?.will_retry).toBe(false);
                }

                return {pacer};
            }

            it(`fires synthetic`, async () => {

                const {pacer} = await commonBackOffTestForFirstResponse('synthetic');


            })

            it(`fires real`, async (cx) => {

                const {pacer} = await commonBackOffTestForFirstResponse('real');

            })

            if( type==='attempt_recovery' ) {

                async function commonBackOffTestForAttemptRecoveryIncrementingUntilTimeout(type_of_429: 'synthetic' | 'real', optionalTestConfig: Partial<FetchPacerOptions> = {}) {
                    vi.useFakeTimers();
                    
                    const pacer = makeTest({ mode: { type: 'attempt_recovery', timeout_ms: 100 }, minimum_time_between_fetch: 0, ...optionalTestConfig});

                    pacer.getMockPaceTracker().logBackOff.mockImplementation(async () => {
                        pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now()+10); // Set it to pause and thus retry 
                    });

                    if( type_of_429==='real' ) {
                        mockFetch.mockResolvedValue(mockFetchResponse(429));
                    } else {
                        pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockImplementation(async () => Date.now()+10);
                    }

                    const events:{event:BackingOffEvent, ts: number, ms: number}[] = [];
                    const st = Date.now();
                    pacer.emitter.on('BACKING_OFF', (event) => {
                        events.push({event, ts: Date.now(), ms: Date.now()-st});
                    })

                    const resPromise = pacer.fetch('url1');

                    for( let i = 0; i < 100; i++ ) {
                        await vi.advanceTimersByTimeAsync(10); // Elapse the backoff
                    }

                    await resPromise;
                    
                    
                    expect(events.length).toBeGreaterThan(0);
                    const incrementingAttempts = events.every((x,idx) => x.event.attempt===idx);
                    expect(incrementingAttempts).toBe(true);

                    // Last should be cannot recover, as we elapsed time 
                    expect(events[events.length-1]?.event.cannot_recover).toBe(true);

                }

                describe('attempt_recovery only', () => {
                    it('increments attempts until max timeout on synthetic', async () => {
                        
                        await commonBackOffTestForAttemptRecoveryIncrementingUntilTimeout('synthetic');
                    })

                    it('increments attempts until max timeout on real', async () => {
                        
                        await commonBackOffTestForAttemptRecoveryIncrementingUntilTimeout('real');
                    })
                })
            }
        });

        describe('Options', () => {
            describe('no max_points_per_second configured', () => {
                
                commonFirstRequestTests(); // No max
                commonPacingTests(); // No max

            });

            describe('back_off_calculation makes no immediate difference', () => {
                
                commonFirstRequestTests({back_off_calculation: {type: 'exponential'}});
                commonPacingTests({back_off_calculation: {type: 'exponential'}});

            });

            it('uses custom_fetch_function when provided', async () => {
                const myCustomFetch = vi.fn().mockResolvedValue(mockFetchResponse(200));
                const pacer = makeTest({ mode: { type }, custom_fetch_function: myCustomFetch });

                await pacer.fetch('url1');
                expect(myCustomFetch).toHaveBeenCalledTimes(1);
                expect(mockFetch).not.toHaveBeenCalled(); // Ensure global mockFetch wasn't used
            });

            describe('minimum_time_between_fetch', () => {
                it('enforces minimum_time_between_fetch for sequential fetches', async () => {
                    const min = 60;
                    const pacer = makeTest({ mode: { type }, minimum_time_between_fetch: min });
                    pacer.getMockPaceTracker().getActiveBackOffForMs.mockResolvedValue(undefined);

                    const callTimes: number[] = [];
                    const st = Date.now();
                    mockFetch.mockImplementation(async () => {
                        callTimes.push(Date.now()-st);
                        return mockFetchResponse(200);
                    });

                    const p1 = pacer.fetch('url1');
                    const p2 = pacer.fetch('url2');
                    await p2;

                    expect(callTimes.length).toBe(2);

                    expectBoundGreaterThan(min*1, callTimes[0], 10);
                    expectBoundGreaterThan(min*2, callTimes[1], 10);
                    
                });

            });

            it('processes fetches sequentially with zero or negative minimum_time_between_fetch', async () => {
                vi.useFakeTimers();
                // Test with 0, negative should behave like 0 due to sleep implementation
                const pacer = makeTest({ mode: { type }, minimum_time_between_fetch: 0 });
                pacer.getMockPaceTracker().getActiveBackOffForMs.mockResolvedValue(undefined);

                const callOrder: string[] = [];
                mockFetch.mockImplementation(async (url: RequestInfo | URL) => {
                    callOrder.push(url.toString());
                    // Simulate async work even with 0 delay
                    await sleep(1);
                    return mockFetchResponse(200);
                });

                const p1 = pacer.fetch('url1');
                const p2 = pacer.fetch('url2');

                await vi.runAllTimersAsync(); // Resolve all setTimeouts including the 0ms sleeps
                await Promise.all([p1, p2]);

                expect(callOrder).toEqual(['url1', 'url2']);
                expect(mockFetch).toHaveBeenCalledTimes(2);
                vi.useRealTimers();
            });
        });

        describe('dispose', () => {
            it('calls paceTracker.dispose and subsequent fetches still attempt to run', async () => {
                const pacer = makeTest({ mode: { type } });
                const mockPaceTracker = pacer.getMockPaceTracker();

                await pacer.dispose();
                expect(mockPaceTracker.dispose).toHaveBeenCalledTimes(1);

                // Current implementation does not prevent further calls, they will proceed using the (mocked) PaceTracker
                mockFetch.mockResolvedValueOnce(mockFetchResponse(200));
                const res = await pacer.fetch('url-after-dispose');
                expect(res.status).toBe(200);
                expect(mockPaceTracker.setActive).toHaveBeenCalledWith(true); // Still gets called
                expect(mockPaceTracker.getActiveBackOffForMs).toHaveBeenCalled(); // Still gets called
            });
        });

    })


}

describe('common', () => {
    commonTestsForMode('429_preemptively');
    commonTestsForMode('attempt_recovery');
});

describe('mode 429_preemptively specific tests', () => {
    it('The response from a paused request includes back_off_for_ms field', async () => {
        // This is covered by common test: 'pauses second attempt after first triggers delay'
        // For completeness, a direct check:
        const pacer = makeTestPreemptiveMode();
        const mockPaceTracker = pacer.getMockPaceTracker();
        vi.setSystemTime(0);
        mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now() + 200);

        const res = await pacer.fetch('url1');
        expect(res.status).toBe(429);
        if (!isBackOffResponse(res)) throw new Error("Expected BackOffResponse");
        expect(res.back_off_for_ms).toBeGreaterThanOrEqual(200);
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('mode attempt_recovery specific tests', () => {
    it('waits for the specified back off duration before retrying fetch', async () => {
        vi.useFakeTimers();
        const pacer = makeTestRecoveryMode();
        const mockPaceTracker = pacer.getMockPaceTracker();

        mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now() + 100); // Pause for 100ms
        mockFetch.mockResolvedValueOnce(mockFetchResponse(200)); // For the retry

        const fetchPromise = pacer.fetch('url1');

        expect(mockFetch).not.toHaveBeenCalled(); // Not called immediately

        vi.advanceTimersByTime(99);
        await vi.runOnlyPendingTimersAsync(); // Process any microtasks
        expect(mockFetch).not.toHaveBeenCalled(); // Still waiting

        vi.advanceTimersByTime(2); // Total 100ms elapsed
        await vi.runOnlyPendingTimersAsync(); // Allow retry logic (setTimeout in queue) to execute

        expect(mockFetch).toHaveBeenCalledTimes(1); // Called after 100ms

        const res = await fetchPromise;
        expect(res.status).toBe(200);
        expect(res.pacing_attempt).toBe(1);
        vi.useRealTimers();
    });


    describe('cannot_recover', () => {
        it('if retrying due to initial PaceTracker backoff exceeds timeout, response includes cannot_recover: true and does not fetch', async () => {
            vi.setSystemTime(0); // Job created_at will be 0
            const pacer = makeTestRecoveryMode({ mode: { type: 'attempt_recovery', timeout_ms: 50 } });
            const mockPaceTracker = pacer.getMockPaceTracker();

            // PaceTracker says to back off for 100ms. Job timeout is 50ms.
            // Date.now() (0) + pauseFor (100) > job.created_at (0) + timeout_ms (50) -> 100 > 50 TRUE
            mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now() + 100);

            const res = await pacer.fetch('url1') as BackOffResponse;

            expect(res.status).toBe(429);
            expect(mockFetch).not.toHaveBeenCalled(); // Should not attempt fetch
            expect(res.cannot_recover).toBe(true);
            expect(res.back_off_for_ms).toBeGreaterThanOrEqual(100); // It still reports the suggested backoff
            
        });

        it('if retrying due to server 429 exceeds timeout, response includes cannot_recover: true after fetch attempt', async () => {
            vi.useFakeTimers();
            const pacer = makeTestRecoveryMode({ mode: { type: 'attempt_recovery', timeout_ms: 50 } });
            const mockPaceTracker = pacer.getMockPaceTracker();

            // First attempt: fetch, server returns 429
            mockFetch.mockResolvedValueOnce(mockFetchResponse(429));

            // After logBackOff, PaceTracker suggests a delay that exceeds timeout
            mockPaceTracker.logBackOff.mockImplementation(async () => {
                // Simulating that by the time logBackOff is processed and new backoff calculated,
                // it's too late.
                // Let's say current time for logBackOff is 10ms (after fetch)
                // And it suggests another 60ms backoff.
                // Retry would be at 10ms + 60ms = 70ms. Initial job at 0ms. Timeout 50ms. 70 > 50.
                vi.setSystemTime(Date.now() + 10); // Simulate time taken for the first fetch call
                mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValue(Date.now() + 60);
            });

            const fetchPromise = pacer.fetch('url1');

            await vi.advanceTimersByTimeAsync(10); // Allow first fetch to "complete" (hit 429) and logBackOff to run
            // This advances time for the `setTimeout` in queue's preventCompletion

            await vi.advanceTimersByTimeAsync(60); // Allow the backoff period to elapse for the retry attempt

            const res = await fetchPromise as BackOffResponse;

            expect(mockFetch).toHaveBeenCalledTimes(1); // Original fetch that got 429
            expect(res.status).toBe(429); // The original 429 response is returned
            expect(res.cannot_recover).toBe(true);
            expect(res.back_off_for_ms).toBeGreaterThanOrEqual(50); // Should be around 60ms
            expect(mockPaceTracker.logBackOff).toHaveBeenCalledTimes(1);
            vi.useRealTimers();
        });
    })
    

    it('retries as soon as backoff duration expires (no extra jitter)', async () => {
        vi.useFakeTimers();
        const pacer = makeTestRecoveryMode();
        const mockPaceTracker = pacer.getMockPaceTracker();

        mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValueOnce(Date.now() + 50); // Pause for 50ms
        mockFetch.mockResolvedValueOnce(mockFetchResponse(200));

        const fetchPromise = pacer.fetch('url1');

        await vi.advanceTimersByTimeAsync(49);
        expect(mockFetch).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(3); // Total 52ms, allowing for some negligible sync execution
        // The job is re-queued with a setTimeout(..., 50).
        // mockFetch is inside the job. So it will be called when the timer fires.
        expect(mockFetch).toHaveBeenCalledTimes(1);

        await fetchPromise;
        vi.useRealTimers();
    });

    describe('Options for attempt_recovery', () => {
        it('retries "indefinitely" if timeout_ms is not specified and PaceTracker keeps suggesting backoff', async () => {
            vi.useFakeTimers();
            // No timeout_ms specified
            const pacer = makeTestRecoveryMode({ mode: { type: 'attempt_recovery' } });
            const mockPaceTracker = pacer.getMockPaceTracker();

            // PaceTracker keeps suggesting a 10ms backoff
            mockPaceTracker.getActiveBackOffUntilTs.mockImplementation(async () => Date.now() + 10);
            // Fetch will never succeed, always hit internal backoff then retry
            mockFetch.mockResolvedValue(mockFetchResponse(200)); // If it ever got to fetch

            const fetchPromise = pacer.fetch('url-infinite-retry');

            let backOffCount = 0;
            pacer.emitter.on('BACKING_OFF', event => {
                backOffCount++;
            })

            // Let it try a few times
            for (let i = 0; i < 100; i++) {
                await vi.advanceTimersByTimeAsync(10); // Elapse the backoff
                // Check that cannot_recover is not set on the pending job logic (hard to inspect directly without modifying FetchPacer)
                // We verify by seeing it does attempt to "retry" (i.e., re-evaluate backoff)
            }

            // At this point, it's still "retrying" by re-checking getActiveBackOffUntilTs
            // The mockFetch is never called because the preemptive check `getActiveBackOffForMs` always yields a delay
            // And `pauseExceedsMaxTimeout` is always false without timeout_ms.
            expect(mockFetch).not.toHaveBeenCalled();

            // To "resolve" the test, we can make PaceTracker stop backing off
            mockPaceTracker.getActiveBackOffUntilTs.mockResolvedValue(undefined);
            await vi.advanceTimersByTimeAsync(10); // Allow one more retry cycle

            const res = await fetchPromise;
            expect(res.status).toBe(200);
            
            expect((res as BackOffResponse).cannot_recover).toBe(undefined);
            expect(res.pacing_attempt).toBeGreaterThan(50); // It's not a perfect 1-1 with the loop iterations, because it takes a few ms to run
            expect(res.pacing_attempt).toBe(backOffCount);
            expect(mockFetch).toHaveBeenCalledTimes(1); // Finally called

            vi.useRealTimers();
        });
    });
});