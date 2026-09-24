import { describe, expect, it } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import type { ActivityItem, Fetch } from './types.ts';

/** A history whose store accepts everything except the charge made as a request is sent. */
class CannotStoreCharges extends ActivityTrackerMemory {
    override async add(activity: ActivityItem): Promise<void> {
        if( activity.type==='reserved' ) throw new Error('store down');
        await super.add(activity);
    }
}

/** A service that answers after a few real milliseconds, once the event loop has moved on. */
function answersShortly(outcome: 'answers' | 'fails'): Fetch {
    return async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        if( outcome==='fails' ) throw new Error('network down');
        return new Response(null, { status: 200 });
    };
}

/**
 * Uses the real pace tracker, and real timers: an unobserved failure is only reported once the
 * event loop moves on, which fake timers never let it do, and a stand-in tracker's failures are
 * always observed by the stand-in itself.
 */
function makePacer(activityTracker: ActivityTrackerMemory, fetchFunction: Fetch): FetchPacer {
    return new FetchPacer('test', {
        storage: { type: 'custom', activity_tracker: () => activityTracker },
        mode: { type: '429_preemptively' },
        max_points_per_second: 100,
        custom_fetch_function: fetchFunction,
        minimum_time_between_fetch: 0
    });
}

describe('a store that cannot record what a request cost', () => {

    it('reports a store that could not record the charge, without leaving the failure unhandled', async () => {
        // The store fails while the response is still on its way. Left unobserved until the
        // response arrives, that failure would surface as an unhandled rejection, which can end
        // the process.
        const activityTracker = new CannotStoreCharges('test');
        const pacer = makePacer(activityTracker, answersShortly('answers'));

        await expect(pacer.fetch('https://svc/?points=5', undefined, 5)).rejects.toThrow('store down');
        expect((await activityTracker.list()).filter(item => item.type==='success')).toEqual([]);
    });

    it('lets the request\'s own failure through when both the request and the store fail', async () => {
        // What went wrong with the request itself is what the caller can act on.
        const pacer = makePacer(new CannotStoreCharges('test'), answersShortly('fails'));

        await expect(pacer.fetch('https://svc/?points=5', undefined, 5)).rejects.toThrow('network down');
    });

});
