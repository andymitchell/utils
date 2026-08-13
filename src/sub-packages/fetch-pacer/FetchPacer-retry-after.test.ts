import { describe, it, expect } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import type { FetchPacerOptions } from './types.ts';
import { expectCloseTo } from './testing-utils/expectInRange.ts';

/**
 * Uses the real pace tracker, because the point at issue is the pause that actually gets
 * stored — which a stand-in tracker would accept without applying.
 */
function makePacerTurnedAwayWith(activityTracker: ActivityTrackerMemory, headers: Record<string, string>): FetchPacer {
    const config: FetchPacerOptions = {
        storage: {
            type: 'custom',
            activity_tracker: () => activityTracker
        },
        mode: {
            type: '429_preemptively'
        },
        custom_fetch_function: (async () => new Response(null, { status: 429, headers })) as unknown as typeof fetch,
        minimum_time_between_fetch: 0,
        back_off_calculation: { type: 'exponential' },
        testing_queue_disable_check_timeout: true
    };
    return new FetchPacer('test', config);
}

/** What the exponential calculation asks for on its own, having been turned away once. */
const FIRST_GUESS_MS = 100;

describe('being told how long to wait after a refusal', () => {

    it('waits the number of seconds the service named', async () => {
        // Guessing is only worth doing when the service has not said. Here it has.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacerTurnedAwayWith(activityTracker, { 'Retry-After': '30' });

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        expectCloseTo(askedAt + 30_000, await activityTracker.getBackOffUntilTs(), 200);
    });

    it('waits until the moment the service named', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const resumeAt = new Date(Date.now() + 45_000);
        const pacer = makePacerTurnedAwayWith(activityTracker, { 'Retry-After': resumeAt.toUTCString() });

        await pacer.fetch('https://example.com');

        // The header carries whole seconds only, so the stored moment lands within one of it.
        expectCloseTo(resumeAt.getTime(), await activityTracker.getBackOffUntilTs(), 1_100);
    });

    it('falls back to its own guess when the service did not say', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacerTurnedAwayWith(activityTracker, {});

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        expectCloseTo(askedAt + FIRST_GUESS_MS, await activityTracker.getBackOffUntilTs(), 200);
    });

    it('falls back to its own guess when what the service said cannot be read', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacerTurnedAwayWith(activityTracker, { 'Retry-After': 'in a bit' });

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        expectCloseTo(askedAt + FIRST_GUESS_MS, await activityTracker.getBackOffUntilTs(), 200);
    });

    it('never comes back sooner than the service was willing to be asked', async () => {
        // The service's instruction is a floor, so a shorter guess of its own cannot win.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacerTurnedAwayWith(activityTracker, { 'Retry-After': '60' });

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        const waitUntil = await activityTracker.getBackOffUntilTs();
        expect(waitUntil).toBeGreaterThanOrEqual(askedAt + 60_000);
    });

});
