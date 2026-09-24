import { describe, it, expect } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import type { FetchPacerOptions } from './types.ts';

/**
 * Uses the real pace tracker rather than a stand-in, because what is being checked here is
 * the tracker actually being wound down — which a stand-in would simply agree to.
 */
function makePacer(activityTracker: ActivityTrackerMemory, fetchFunction: typeof fetch): FetchPacer {
    const config: FetchPacerOptions = {
        storage: {
            type: 'custom',
            activity_tracker: () => activityTracker
        },
        mode: {
            type: '429_preemptively'
        },
        custom_fetch_function: fetchFunction,
        minimum_time_between_fetch: 0,
        testing_queue_disable_check_timeout: true
    };
    return new FetchPacer('test', config);
}

/** Answers the first request, then refuses every one after it. */
function failsAfterTheFirstRequest(): typeof fetch {
    let requests = 0;
    return (async () => {
        requests++;
        if (requests > 1) throw new Error('network down');
        return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
}

describe('a request that fails outright', () => {

    it('leaves nothing tracking in the background', async () => {
        // A tracker may do less while its pacer is idle, so a failed request must not leave it
        // believing requests are still under way.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, failsAfterTheFirstRequest());

        // The first request settles tracking into its idle state, which is what makes the
        // second one start it up again.
        await pacer.fetch('https://example.com/first');

        await expect(pacer.fetch('https://example.com/second')).rejects.toThrow('network down');

        expect(await activityTracker.isActive()).toBe(false);
    });

    it('still reports the failure to the caller', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, failsAfterTheFirstRequest());

        await pacer.fetch('https://example.com/first');

        await expect(pacer.fetch('https://example.com/second')).rejects.toThrow('network down');
    });

    it('leaves the pacer able to run the next request', async () => {
        // Winding tracking down must not be mistaken for shutting the pacer itself down.
        const activityTracker = new ActivityTrackerMemory('test');
        let requests = 0;
        const pacer = makePacer(activityTracker, (async () => {
            requests++;
            if (requests === 2) throw new Error('network down');
            return new Response(null, { status: 200 });
        }) as unknown as typeof fetch);

        await pacer.fetch('https://example.com/first');
        await expect(pacer.fetch('https://example.com/second')).rejects.toThrow('network down');

        const recovered = await pacer.fetch('https://example.com/third');

        expect(recovered.status).toBe(200);
    });

});
