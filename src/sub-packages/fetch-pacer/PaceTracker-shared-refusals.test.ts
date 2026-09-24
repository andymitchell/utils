import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaceTracker from './PaceTracker.ts';
import { ActivityTrackerKvStorage } from './activity-trackers/ActivityTrackerKvStorage.ts';
import { MemoryStorage } from '../kv-storage/index-node.ts';
import type { PaceTrackerOptions } from './types.ts';

/** The trackers of two pacers sharing one store for the same resource. */
function twoPacersSharing(options: Pick<PaceTrackerOptions, 'back_off_calculation'> = {}) {
    const store = new MemoryStorage();
    const storage: PaceTrackerOptions['storage'] = {
        type: 'custom',
        activity_tracker: (id, trackerOptions) => new ActivityTrackerKvStorage(id, store, trackerOptions)
    };
    return { refused: new PaceTracker('test', { ...options, storage }), other: new PaceTracker('test', { ...options, storage }) };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('a refusal recorded in the same instant as another pacer\'s success', () => {
    // An answer is recorded when it comes back, so a success from another pacer recorded in the
    // same instant as a refusal was most likely let in before the limit was hit.

    it('still pauses every request for the refusal', async () => {
        const { refused, other } = twoPacersSharing({ back_off_calculation: { type: 'exponential', initial_back_off_ms: 100 } });

        await other.logSuccess(0);
        await refused.logBackOff();

        expect(await refused.getRefusalPauseUntilTs()).toBe(1100);
        expect(await other.getRefusalPauseUntilTs()).toBe(1100);
    });

    it('pauses for the calculated back-off when it is longer than the wait the service named', async () => {
        const { refused, other } = twoPacersSharing({ back_off_calculation: { type: 'exponential', initial_back_off_ms: 1000 } });

        await other.logSuccess(0);
        await refused.logBackOff(50);

        expect(await refused.getRefusalPauseUntilTs()).toBe(2000);
    });

    it('pauses for the fixed back-off when no calculation is set', async () => {
        const { refused, other } = twoPacersSharing();

        await other.logSuccess(0);
        await refused.logBackOff();

        expect(await refused.getRefusalPauseUntilTs()).toBe(1200);
    });

    it('counts the refusal as the next in the run that earlier refusals began', async () => {
        const { refused, other } = twoPacersSharing({ back_off_calculation: { type: 'exponential', initial_back_off_ms: 100 } });
        vi.setSystemTime(800);
        await refused.logBackOff();
        vi.setSystemTime(900);
        await refused.logBackOff();

        vi.setSystemTime(1000);
        await other.logSuccess(0);
        await refused.logBackOff();

        // The third refusal in the run: 100, then 200, then 400 ms.
        expect(await refused.getRefusalPauseUntilTs()).toBe(1400);
    });

    it('still lets a success recorded before the refusal end the run', async () => {
        const { refused, other } = twoPacersSharing({ back_off_calculation: { type: 'exponential', initial_back_off_ms: 100 } });
        vi.setSystemTime(800);
        await refused.logBackOff();

        vi.setSystemTime(990);
        await other.logSuccess(0);
        vi.setSystemTime(1000);
        await refused.logBackOff();

        expect(await refused.getRefusalPauseUntilTs()).toBe(1100);
    });

});
