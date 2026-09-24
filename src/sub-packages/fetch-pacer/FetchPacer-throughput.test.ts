import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { FakeQuotaServer } from './testing-utils/FakeQuotaServer.ts';

const QUOTA_PER_SECOND = 200;

function pacerFor(server: FakeQuotaServer): FetchPacer {
    return new FetchPacer('throughput', {
        mode: { type: 'attempt_recovery' },
        max_points_per_second: QUOTA_PER_SECOND,
        minimum_time_between_fetch: 0,
        custom_fetch_function: server.fetch
    });
}

/**
 * Asks for far more than the quota can carry in the time a test runs for, all at once, so the
 * pacer always has a request waiting and any idle time is its own doing.
 */
function demandMoreThanItCanSend(pacer: FetchPacer, count: number, points: number): void {
    for (let i = 0; i < count; i++) void pacer.fetch(`https://svc/?points=${points}`, undefined, points);
}

describe('spending a quota that is always in demand', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses nearly all of the quota rather than a fraction of it', async () => {
        const server = new FakeQuotaServer(50);
        const pacer = pacerFor(server);

        demandMoreThanItCanSend(pacer, 300, 100);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(server.pointsPerSecond(1000, 60_000)).toBeGreaterThanOrEqual(QUOTA_PER_SECOND * 0.9);
        await pacer.dispose();
    });

    it('stays close to the quota with small cheap requests too', async () => {
        const server = new FakeQuotaServer(0);
        const pacer = pacerFor(server);

        demandMoreThanItCanSend(pacer, 2000, 10);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(server.pointsPerSecond(1000, 60_000)).toBeGreaterThanOrEqual(QUOTA_PER_SECOND * 0.9);
        await pacer.dispose();
    });

    it('never exceeds the quota in any one-second window', async () => {
        const slowLarge = new FakeQuotaServer(50);
        const quickSmall = new FakeQuotaServer(0);
        const pacers = [pacerFor(slowLarge), pacerFor(quickSmall)];

        demandMoreThanItCanSend(pacers[0]!, 300, 100);
        demandMoreThanItCanSend(pacers[1]!, 2000, 10);
        await vi.advanceTimersByTimeAsync(20_000);

        expect(slowLarge.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(QUOTA_PER_SECOND);
        expect(quickSmall.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(QUOTA_PER_SECOND);
        expect(slowLarge.hits.length).toBeGreaterThan(0);
        expect(quickSmall.hits.length).toBeGreaterThan(0);
        await Promise.all(pacers.map(pacer => pacer.dispose()));
    });

});
