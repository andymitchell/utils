import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import PaceTracker from './PaceTracker.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import type { SetBackOffUntilTsOptions } from './types.ts';

/**
 * Records when a pause finished being written, and takes long enough doing it that a caller
 * which forgot to wait would be seen carrying on without it.
 */
class SlowPauseWriteTracker extends ActivityTrackerMemory {

    /** Whether the most recently requested pause has actually been stored. */
    pauseStored = false;

    override async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        this.pauseStored = false;
        for (let turn = 0; turn < 5; turn++) await Promise.resolve();
        await super.setBackOffUntilTs(ts, options);
        this.pauseStored = true;
    }
}

describe('storing the pause that a request earned', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('has stored the pause by the time the request is reported as logged', async () => {
        // A caller that sends its next request the moment this resolves would otherwise
        // race the write, and be waved through against a quota it had already spent.
        const activityTracker = new SlowPauseWriteTracker('test');
        const paceTracker = new PaceTracker('test', {
            max_points_per_second: 100,
            storage: { type: 'custom', activity_tracker: () => activityTracker }
        });

        await paceTracker.logSuccess(200);

        expect(activityTracker.pauseStored).toBe(true);
    });

    it('reports the pause to the very next caller that asks', async () => {
        const activityTracker = new SlowPauseWriteTracker('test');
        const paceTracker = new PaceTracker('test', {
            max_points_per_second: 100,
            storage: { type: 'custom', activity_tracker: () => activityTracker }
        });

        await paceTracker.logSuccess(200);

        expect(await paceTracker.getActiveBackOffUntilTs()).toBe(2000);
    });

});
