import { describe, it, expect } from 'vitest';

import FetchPacerMultiClient from './FetchPacerMultiClient.ts';
import FetchPacer from './FetchPacer.ts';
import type { FetchPacerOptions } from './types.ts';
import { expectCloseTo } from './testing-utils/expectInRange.ts';

/**
 * Answers every request, so that any pause seen in these tests came from what was reported
 * rather than from a refusal the pacer witnessed for itself.
 */
const alwaysAnswers = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

const baseConfig: FetchPacerOptions = {
    mode: {
        type: '429_preemptively'
    },
    back_off_calculation: { type: 'exponential' },
    custom_fetch_function: alwaysAnswers,
    minimum_time_between_fetch: 0,
    testing_queue_disable_check_timeout: true
};

describe('reporting a refusal the pacer did not see itself', () => {

    it('holds the next request back after being told the service refused one', async () => {
        // A batch call spends its whole cost at once, and a refusal inside it is invisible to
        // the pacer — the batch itself came back a success.
        const pacer = new FetchPacerMultiClient('resource', baseConfig);

        await pacer.logBackOff(undefined, 'user-a');
        const response = await pacer.fetch('https://example.com', undefined, 1, 'user-a');

        expect(response.status).toBe(429);
    });

    it('waits at least as long as the report said to', async () => {
        const pacer = new FetchPacerMultiClient('resource', baseConfig);

        await pacer.logBackOff(30_000, 'user-a');

        expectCloseTo(30_000, await pacer.getActiveBackOffForMs('user-a'), 200);
    });

    it('holds back only the client the refusal concerned', async () => {
        // Quota is counted per user, so one user being refused says nothing about another.
        const pacer = new FetchPacerMultiClient('resource', baseConfig);

        await pacer.logBackOff(30_000, 'user-a');

        expect(await pacer.getActiveBackOffForMs('user-b')).toBeUndefined();
        expect((await pacer.fetch('https://example.com', undefined, 1, 'user-b')).status).toBe(200);
    });

    it('reports no wait when nothing is holding requests back', async () => {
        const pacer = new FetchPacerMultiClient('resource', baseConfig);

        expect(await pacer.getActiveBackOffForMs('user-a')).toBeUndefined();
    });

    it('tracks the default client when no client was named', async () => {
        const pacer = new FetchPacerMultiClient('resource', baseConfig);

        await pacer.logBackOff(30_000);

        expectCloseTo(30_000, await pacer.getActiveBackOffForMs(), 200);
    });

    it('reads back the wait a spend earned, not only a refusal', async () => {
        // 200 points against 100 per second leaves the window over-full until they leave it.
        const pacer = new FetchPacerMultiClient('resource', { ...baseConfig, max_points_per_second: 100 });

        await pacer.logPointsManually(200, 'user-a');

        expectCloseTo(1000, await pacer.getActiveBackOffForMs('user-a'), 50);
    });

    it('lets the wait be read back on a single pacer too', async () => {
        const pacer = new FetchPacer('resource', baseConfig);

        await pacer.logBackOff(30_000);

        expectCloseTo(30_000, await pacer.getActiveBackOffForMs(), 200);
    });

});
