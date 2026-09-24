import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('./PaceTracker.ts', async () => ({
    default: (await import('./testing-utils/MockPaceTracker.ts')).MockPaceTracker
}));

import { FetchPacerForTesting } from './testing-utils/FetchPacerForTesting.ts';
import { expectBetweenNumbers, expectBoundGreaterThan } from './testing-utils/expectInRange.ts';
import { settle } from './testing-utils/settle.ts';
import type { Fetch, FetchPacerOnlyOptions, FetchPacerOptions } from './types.ts';

const MODES: FetchPacerOnlyOptions['mode']['type'][] = ['429_preemptively', 'attempt_recovery'];

let mockFetch: Mock<Fetch>;

const answered = () => new Response(null, { status: 200 });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A pacer whose tracker is a stand-in, so each test decides what it is told about quota and pauses. */
function makePacer(options: Partial<FetchPacerOptions>): FetchPacerForTesting {
    return new FetchPacerForTesting('test', {
        mode: { type: '429_preemptively' },
        custom_fetch_function: mockFetch,
        minimum_time_between_fetch: 0,
        ...options
    });
}

/** Records when each request reaches the network. */
function recordSendTimes(): number[] {
    const sendTimes: number[] = [];
    mockFetch.mockImplementation(async () => {
        sendTimes.push(Date.now());
        return answered();
    });
    return sendTimes;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    mockFetch = vi.fn<Fetch>(async () => answered());
});

afterEach(() => {
    vi.useRealTimers();
});

describe('sending a request', () => {

    for (const type of MODES) {
        describe(`in ${type} mode`, () => {

            describe('spacing one request from the next', () => {

                it('sends the first request at once and spaces the rest by the minimum gap', async () => {
                    const min = 30;
                    const pacer = makePacer({ mode: { type }, minimum_time_between_fetch: min });
                    const sendTimes = recordSendTimes();

                    await settle(Promise.all([pacer.fetch('url1'), pacer.fetch('url2'), pacer.fetch('url3')]), 1);

                    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual(['url1', 'url2', 'url3']);
                    expectBetweenNumbers(0, 20, sendTimes[0]);
                    expectBoundGreaterThan(min, sendTimes[1]! - sendTimes[0]!, 20);
                    expectBoundGreaterThan(min, sendTimes[2]! - sendTimes[1]!, 20);
                });

                it('keeps at least the minimum gap between one request and the next', async () => {
                    const min = 60;
                    const pacer = makePacer({ mode: { type }, minimum_time_between_fetch: min });
                    const sendTimes = recordSendTimes();

                    await settle(Promise.all([pacer.fetch('url1'), pacer.fetch('url2')]), 1);

                    expect(sendTimes).toHaveLength(2);
                    expectBetweenNumbers(0, 10, sendTimes[0]);
                    expectBoundGreaterThan(min, sendTimes[1]! - sendTimes[0]!, 10);
                });

            });

            describe('charging for what is sent', () => {

                it('does not bother reserving when a request costs nothing', async () => {
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 10 });
                    const mockPaceTracker = pacer.getMockPaceTracker();

                    await settle(pacer.fetch('url1'));

                    expect(mockPaceTracker.reservePoints).not.toHaveBeenCalled();
                    expect(mockPaceTracker.logSuccess).toHaveBeenCalledWith(0);
                });

                it('keeps the charge when the request itself throws', async () => {
                    // The request may have reached the service before failing, so it may have been metered.
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 10 });
                    const mockPaceTracker = pacer.getMockPaceTracker();
                    mockFetch.mockRejectedValueOnce(new Error('network down'));

                    await expect(settle(pacer.fetch('url1', undefined, 5))).rejects.toThrow('network down');
                    expect(mockPaceTracker.reservePoints).toHaveBeenCalledWith(5);
                    expect(mockPaceTracker.logSuccess).not.toHaveBeenCalled();
                });

                it('charges the points as it sends and marks the success when it returns', async () => {
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 10 });
                    const mockPaceTracker = pacer.getMockPaceTracker();
                    const seenWhileSending: { reserved: unknown[][], succeeded: number }[] = [];
                    mockFetch.mockImplementationOnce(async () => {
                        seenWhileSending.push({ reserved: [...mockPaceTracker.reservePoints.mock.calls], succeeded: mockPaceTracker.logSuccess.mock.calls.length });
                        return answered();
                    });

                    await settle(pacer.fetch('url1', undefined, 5));

                    expect(seenWhileSending).toEqual([{ reserved: [[5]], succeeded: 0 }]);
                    expect(mockPaceTracker.logSuccess.mock.calls).toEqual([[0]]);
                });

                it('asks how long to hold back a request of the size it is about to send', async () => {
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 10 });

                    await settle(pacer.fetch('url1', undefined, 5));

                    expect(pacer.getMockPaceTracker().getPauseBeforeMs).toHaveBeenCalledWith(5);
                });

            });

        });
    }

    describe('spacing requests that are held back', () => {

        it('does not wait the gap before deciding that a request must be held back', async () => {
            const pacer = makePacer({ mode: { type: '429_preemptively' }, minimum_time_between_fetch: 200 });
            pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValueOnce(50);

            const res = await settle(pacer.fetch('url1'), 1);

            expect(res.status).toBe(429);
            expect(Date.now()).toBeLessThan(200);
        });

        it('measures the gap from the moment the previous request was actually sent', async () => {
            // Building the first request is slow; the second must still leave the full gap after
            // the first actually went, not after the first was asked for.
            const pacer = makePacer({ mode: { type: '429_preemptively' }, minimum_time_between_fetch: 100 });
            const sendTimes = recordSendTimes();
            let builds = 0;
            const slowOnlyAtFirst = async () => {
                if( builds++===0 ) await wait(150);
                return {};
            };

            await settle(Promise.all([pacer.fetch('url1', slowOnlyAtFirst), pacer.fetch('url2', slowOnlyAtFirst)]), 1);

            expect(sendTimes).toHaveLength(2);
            expectBetweenNumbers(150, 155, sendTimes[0]);
            expect(sendTimes[1]! - sendTimes[0]!).toBeGreaterThanOrEqual(100);
        });

        it('does not add the gap on top of a pause it has already waited out', async () => {
            const pacer = makePacer({ mode: { type: 'attempt_recovery' }, minimum_time_between_fetch: 30 });
            const sendTimes = recordSendTimes();
            // The first request goes freely; the second finds everything held back until 100.
            pacer.getMockPaceTracker().getActiveBackOffUntilTs.mockResolvedValueOnce(undefined).mockResolvedValueOnce(100);

            await settle(Promise.all([pacer.fetch('url1'), pacer.fetch('url2')]), 1);

            expect(sendTimes).toHaveLength(2);
            expectBetweenNumbers(0, 5, sendTimes[0]);
            expectBetweenNumbers(100, 105, sendTimes[1]);
        });

    });

});
