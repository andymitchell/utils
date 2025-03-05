import { describe, test, expect, vi } from 'vitest';
import FetchPacer from './FetchPacer.js';
import type { BackOffResponse, FetchPacerOptions } from './types.js';
import closeTo from './testing-utils/closeTo.js';

import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.js';
import { MockChromeStorageArea } from '../kv-storage/index.js';
import { sleep } from '../../main/misc.js';

const mockFetch = vi.fn(() => Promise.resolve({ status: 200 }));
global.fetch = mockFetch as unknown as typeof fetch;

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
        hail_mary_after_many_failures: false,
        ...optionalTestConfig,
    };
    return new FetchPacer('test', config);
}

function makeTestRecoveryMode(optionalTestConfig: Partial<FetchPacerOptions> = {}): FetchPacer {
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
})

const pointsPeriod = 1000;

describe('Preemptive Mode', () => {


    describe('Basic Fetch (No Points, No Back Off)', () => {

        test('fetch works fine without rate limiting', async () => {
            
            const fetchPacer = makeTest();

            const response = await fetchPacer.fetch('https://example.com');
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('429 response returns to caller without retry', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 });
            const fetchPacer = makeTest();

            const response = await fetchPacer.fetch('https://example.com');
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(429);
        });

    });

    
    describe('Points and Rate Limiting (No Back Off)', () => {

        test('fetch works fine within points limit', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('allows burst for single high-point request', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 10);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('staggered requests if exceeding max points per second', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 3);
            const response2 = await fetchPacer.fetch('https://example.com', undefined, 3); 

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(429);
            expect((response2 as BackOffResponse).back_off_for_ms).toBe(pointsPeriod); // Points based, so it's one cycle 
        });

        test('429 response returns without retry when no back off used', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 });
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(429);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });


        test('if use points greater than a maximum, it will allow ', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            const start = Date.now();
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 6); // It should allow this through

            
            expect(response1.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        })

        test('if use points greater than a maximum, it will allow but delay the next all', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5 });

            const start = Date.now();
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 6); // It should allow this through
            const response2 = await fetchPacer.fetch('https://example.com', undefined, 0); // should stagger this with a delay, because of the excess first call


            
            expect(response1.status).toBe(200);
            expect(response2.status).toBe(429);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            
        })


    });

    
    describe('Back Off (No Points)', () => {

        test('fetch returns normally if no 429 received', async () => {
            
            const fetchPacer = makeTest({ back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('fetch returns single 429', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 }).mockResolvedValueOnce({ status: 200 });
            const fetchPacer = makeTest({ back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(response.status).toBe(429);
        });

        test('exponential back off on multiple 429 responses - only back offs for first interval due to pre emptive not extending the back offs', async () => {
            
            

            const fetchPacer = makeTest({ back_off_calculation: { type: 'exponential' } });

            mockFetch.mockResolvedValue({status: 429});
            const st = Date.now();
            await fetchPacer.fetch('https://example.com');
            await fetchPacer.fetch('https://example.com');
            const lastResult = await fetchPacer.fetch('https://example.com');

            const elapsed = Date.now()-st;

            console.log({lastResult, elapsed})

            expect(mockFetch).toHaveBeenCalledTimes(1); // It's pre-emptively responding after the first failure 
            expect(lastResult.status).toBe(429);
            expect( closeTo((lastResult as BackOffResponse).back_off_for_ms!, 100-elapsed)).toBe(true); // 100 because that's the first exponenital interval

        });

        test('exponential back off on multiple 429 responses - will increase on subsequent attempts', async () => {

            const fetchPacer = makeTest({ back_off_calculation: { type: 'exponential' } });

            
            mockFetch.mockResolvedValueOnce({status: 429});
            const result1 = await fetchPacer.fetch('https://example.com');
            await sleep(100);
            
            mockFetch.mockResolvedValueOnce({status: 429});
            const result2 = await fetchPacer.fetch('https://example.com');
            await sleep(200);
            
            mockFetch.mockResolvedValueOnce({status: 429});
            const result3 = await fetchPacer.fetch('https://example.com');


            expect(mockFetch).toHaveBeenCalledTimes(3); 
            expect(result3.status).toBe(429);
            expect( closeTo((result3 as BackOffResponse).back_off_for_ms!, 400)).toBe(true); 

        });

        test('exponential back off on multiple 429 responses - will clear and allow 200', async () => {

            const fetchPacer = makeTest({ back_off_calculation: { type: 'exponential' } });

            
            mockFetch.mockResolvedValueOnce({status: 429});
            const result1 = await fetchPacer.fetch('https://example.com');
            await sleep(100);
            
            mockFetch.mockResolvedValueOnce({status: 429});
            const result2 = await fetchPacer.fetch('https://example.com');
            await sleep(200);
            
            mockFetch.mockResolvedValueOnce({status: 200});
            const result3 = await fetchPacer.fetch('https://example.com');


            expect(mockFetch).toHaveBeenCalledTimes(3); 
            expect(result3.status).toBe(200);
            

        });

    });

    
    describe('Points, Rate Limiting, and Back Off', () => {

        test('fetch works normally if within points limit and no 429', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('staggered requests when exceeding max points and back off occurs', async () => {
            
            const fetchPacer = makeTest({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });

            const result1 = await fetchPacer.fetch('https://example.com', undefined, 3);
            const result2 = await fetchPacer.fetch('https://example.com', undefined, 3);

            
            expect(mockFetch).toHaveBeenCalledTimes(1); // It's pre-emptively responding
            expect(result1.status).toBe(200);
            expect(result2.status).toBe(429);
            expect((result2 as BackOffResponse).back_off_for_ms).toBe(pointsPeriod);

        });


    });

});




describe('Recovery Mode', () => {


    
    describe('Basic Fetch (No Points, No Back Off)', () => {

        test('fetch works fine without rate limiting', async () => {
            
            const fetchPacer = makeTestRecoveryMode();

            const response = await fetchPacer.fetch('https://example.com');
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('429 response returns to caller without retry', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 });
            const fetchPacer = makeTestRecoveryMode();

            const response = await fetchPacer.fetch('https://example.com');
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(429);
        });

    });

    
    describe('Points and Rate Limiting (No Back Off)', () => {

        test('fetch works fine within points limit', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);
            
            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('allows burst for single high-point request', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 10);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('staggered requests if exceeding max points per second', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const start = Date.now();
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 3);
            const response2 = await fetchPacer.fetch('https://example.com', undefined, 3); // should stagger this with a delay to callback


            const elapsed = Date.now() - start;
            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(elapsed).toBeGreaterThanOrEqual(pointsPeriod); // Time of a period 
        });

        test('429 response returns without retry when no back off used', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 });
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(429);
        });


        test('if use points greater than a maximum, it will allow ', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const start = Date.now();
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 6); // It should allow this through

            const elapsed = Date.now() - start;
            expect(response1.status).toBe(200);
            expect(elapsed).toBeLessThan(100); 
        })

        test('if use points greater than a maximum, it will allow but delay the next all', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5 });

            const start = Date.now();
            const response1 = await fetchPacer.fetch('https://example.com', undefined, 6); // It should allow this through
            const response2 = await fetchPacer.fetch('https://example.com', undefined, 0); // should stagger this with a delay, because of the excess first call


            const elapsed = Date.now() - start;
            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(elapsed).toBeGreaterThanOrEqual(pointsPeriod); // Time of a period 
        })


    });

    
    describe('Back Off (No Points)', () => {

        test('fetch returns normally if no 429 received', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('fetch retries with back off on single 429', async () => {
            
            mockFetch.mockResolvedValueOnce({ status: 429 }).mockResolvedValueOnce({ status: 200 });
            const fetchPacer = makeTestRecoveryMode({ back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(response.status).toBe(200);
        });

        test('exponential back off on multiple 429 responses', async () => {
            
            

            let lastCallAt = Date.now();
            let calls:{status: number, time_since_last: number}[] = [];
            function logCall(status:number) {
                const time_since_last = Date.now()-lastCallAt;
                lastCallAt = Date.now();
                calls.push({status, time_since_last});
                return {status};
            }

            mockFetch
                .mockImplementationOnce(async () => logCall(429))
                .mockImplementationOnce(async () => logCall(429))
                .mockImplementationOnce(async () => logCall(429))
                .mockImplementationOnce(async () => logCall(200))
            const fetchPacer = makeTestRecoveryMode({ back_off_calculation: { type: 'exponential' } });

            await fetchPacer.fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledTimes(4);
            const roughTimesBetween = [0, 100, 200, 400];
            roughTimesBetween.forEach((ms, index) => {
                expect(calls[index]?.time_since_last).toBeGreaterThan(ms);
                expect(calls[index]?.time_since_last).toBeLessThan(ms+100); // Allow slow processing
            })
        });

    });

    
    describe('Points, Rate Limiting, and Back Off', () => {

        test('fetch works normally if within points limit and no 429', async () => {
            
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });

            const response = await fetchPacer.fetch('https://example.com', undefined, 3);

            expect(mockFetch).toHaveBeenCalledOnce();
            expect(response.status).toBe(200);
        });

        test('staggered requests when exceeding max points and back off occurs', async () => {
            
            const fetchPacer = makeTestRecoveryMode({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });

            const start = Date.now();
            await fetchPacer.fetch('https://example.com', undefined, 3);
            await fetchPacer.fetch('https://example.com', undefined, 3);

            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(400); // Includes rate limit delay and back off
        });


    });
})


describe("Shared DB test", () => {

    test(`shared resource behaves same for both`, async () => {
        const id = 'abc';

        const storage = new MockChromeStorageArea();
        const activityTracker1 = new ActivityTrackerBrowserLocal(id, {}, storage);
        const activityTracker2 = new ActivityTrackerBrowserLocal(id, {}, storage);

        const baseConfig:FetchPacerOptions = {
            mode: {
                type: '429_preemptively'
            },
            max_points_per_second: 5,
            back_off_calculation: {type: 'exponential'}
        }

        const fetchPacer1 = new FetchPacer(id, {
            ...baseConfig,
            storage: {
                type: 'custom', 
                activity_tracker: () => activityTracker1
            }
        })
        const fetchPacer2 = new FetchPacer(id, {
            ...baseConfig,
            storage: {
                type: 'custom', 
                activity_tracker: () => activityTracker2
            }
        })

        const response1 = await fetchPacer1.fetch('https://example.com', undefined, 3);
        const response2 = await fetchPacer2.fetch('https://example.com', undefined, 3); 

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(429);
        expect((response2 as BackOffResponse).back_off_for_ms).toBe(pointsPeriod); // Points based, so it's one cycle 


    })

})