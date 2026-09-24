import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { FakeQuotaServer } from './testing-utils/FakeQuotaServer.ts';
import { expectBetweenNumbers, expectBoundGreaterThan } from './testing-utils/expectInRange.ts';
import { settle } from './testing-utils/settle.ts';
import type { Fetch, FetchPacerOnlyOptions, FetchPacerOptions } from './types.ts';

const MODES: FetchPacerOnlyOptions['mode']['type'][] = ['429_preemptively', 'attempt_recovery'];

/** The service a pacer sends to unless a test names another; it answers 200 unless told otherwise. */
let service: Mock<Fetch>;
let made: FetchPacer[] = [];

const answered = () => new Response(null, { status: 200 });
const refused = () => new Response(null, { status: 429 });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A pacer with a history of its own, sending to `service` with no gap between sends unless told otherwise. */
function makePacer(options: Partial<FetchPacerOptions>): FetchPacer {
    const pacer = new FetchPacer('test', {
        mode: { type: '429_preemptively' },
        custom_fetch_function: service,
        minimum_time_between_fetch: 0,
        ...options
    });
    made = [...made, pacer];
    return pacer;
}

/** Records when each request reaches the service. */
function recordSendTimes(): number[] {
    const sendTimes: number[] = [];
    service.mockImplementation(async () => {
        sendTimes.push(Date.now());
        return answered();
    });
    return sendTimes;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    service = vi.fn<Fetch>(async () => answered());
});

afterEach(async () => {
    await Promise.all(made.map(pacer => pacer.dispose()));
    made = [];
    vi.useRealTimers();
    vi.restoreAllMocks();
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

                    expect(service.mock.calls.map(([url]) => url)).toEqual(['url1', 'url2', 'url3']);
                    expectBetweenNumbers(0, 20, sendTimes[0]);
                    expectBoundGreaterThan(min, sendTimes[1]! - sendTimes[0]!, 20);
                    expectBoundGreaterThan(min, sendTimes[2]! - sendTimes[1]!, 20);
                });

            });

            describe('charging for what is sent', () => {

                it('takes no room in the quota for a request that states no cost', async () => {
                    // The pacer warns that the cost is missing; that is not what is tested here.
                    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
                    const server = new FakeQuotaServer(0);
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 100, custom_fetch_function: server.fetch });

                    const responses = await settle(Promise.all([
                        pacer.fetch('https://svc/'),
                        pacer.fetch('https://svc/?points=100', undefined, 100)
                    ]), 1);

                    expect(responses.map(response => response.status)).toEqual([200, 200]);
                    expect(server.hits.map(hit => hit.points)).toEqual([0, 100]);
                    expectBetweenNumbers(0, 5, server.hits[1]!.ts);
                });

                it('keeps the charge when the request itself throws', async () => {
                    // The request may have reached the service before failing, so it may have been metered.
                    const pacer = makePacer({ mode: { type }, max_points_per_second: 100 });
                    const sendTimes = recordSendTimes();
                    service.mockRejectedValueOnce(new Error('network down'));

                    await expect(settle(pacer.fetch('url1', undefined, 100))).rejects.toThrow('network down');
                    await settle(pacer.fetch('url2', undefined, 100));

                    // Whether it is answered at once with a 429 or held until it fits, a request
                    // taking the whole quota is not sent until the failed one's charge has aged out.
                    expect(sendTimes.filter(ts => ts < 1000)).toEqual([]);
                });

            });

        });
    }

    describe('ending a run of refusals', () => {

        it('treats the next refusal after a success as the first of a new run', async () => {
            // Each refusal in a run doubles the pause, so a success that did not end the run
            // would leave the next refusal waiting twice as long.
            const pacer = makePacer({ back_off_calculation: { type: 'exponential', initial_back_off_ms: 100 } });
            service.mockResolvedValueOnce(refused()).mockResolvedValueOnce(answered()).mockResolvedValueOnce(refused());

            const first = await settle(pacer.fetch('url1'), 1);
            await vi.advanceTimersByTimeAsync(200);
            await settle(pacer.fetch('url2'), 1);
            // A success recorded in the same instant as a refusal does not end its run, so the
            // next answer comes a moment later, as a real service's would.
            await vi.advanceTimersByTimeAsync(10);
            const afterSuccess = await settle(pacer.fetch('url3'), 1);

            expect(first.back_off_for_ms).toBe(100);
            expect(afterSuccess.back_off_for_ms).toBe(100);
        });

    });

    describe('spacing requests that are held back', () => {

        it('does not count a request it held back unsent as a send when spacing the next', async () => {
            // The gap keeps sends apart, and a request that was never sent took no part in that.
            const pacer = makePacer({ minimum_time_between_fetch: 300 });
            const sendTimes = recordSendTimes();
            await pacer.logBackOff(); // With no back-off calculation, every request now waits 200 ms.

            const heldBack = await settle(pacer.fetch('url1'), 1);
            await vi.advanceTimersByTimeAsync(200 - Date.now());
            await settle(pacer.fetch('url2'), 1);

            expect(heldBack.status).toBe(429);
            expect(sendTimes).toHaveLength(1);
            expectBetweenNumbers(200, 205, sendTimes[0]);
        });

        it('measures the gap from the moment the previous request was actually sent', async () => {
            // Building the first request is slow; the second must still leave the full gap after
            // the first actually went, not after the first was asked for.
            const pacer = makePacer({ minimum_time_between_fetch: 100 });
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

            await settle(pacer.fetch('url1'), 1);
            await pacer.logBackOff(300); // Every request now waits until 300.
            await settle(pacer.fetch('url2'), 1);

            expect(sendTimes).toHaveLength(2);
            expectBetweenNumbers(0, 5, sendTimes[0]);
            expectBetweenNumbers(300, 305, sendTimes[1]);
        });

    });

    describe('giving up on a request', () => {

        it('keeps waiting for as long as it takes when the timeout is 0', async () => {
            // A timeout of 0 sets no limit; it does not mean giving up at once.
            const pacer = makePacer({ mode: { type: 'attempt_recovery', timeout_ms: 0 } });
            const sendTimes = recordSendTimes();
            await pacer.logBackOff(60_000); // Every request now waits a minute.

            const response = await settle(pacer.fetch('url1'), 1000);

            expect(response.status).toBe(200);
            expect(response.cannot_recover).toBeUndefined();
            expectBetweenNumbers(60_000, 60_005, sendTimes[0]);
        });

    });

});
