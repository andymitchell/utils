import { describe, it, expect, beforeEach, afterEach, vi, type MockedClass, type Mocked } from 'vitest';
import PaceTracker from './PaceTracker.ts';
import { ActivityTrackerKvStorage } from './activity-trackers/ActivityTrackerKvStorage.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import { MemoryStorage } from '../kv-storage/index-node.ts';
import type { IKvStorage } from '../kv-storage/types.ts';
import type { ActivityItem } from './types.ts';

/** Takes 300ms to store anything, as a slow durable store might. */
class SlowToStoreTracker extends ActivityTrackerMemory {
    override async add(activity: ActivityItem): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        await super.add(activity);
    }
}


describe('holding requests back to stay within a quota', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('holds nothing back after a spend that fits', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(10);

        expect(await tracker.getPauseBeforeMs(90)).toBeUndefined();
    });

    it('holds a request back until enough earlier spend has left the window', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(60);
        vi.setSystemTime(400);

        expect(await tracker.getPauseBeforeMs(50)).toBe(600);
    });

    it('lets a request larger than the whole quota through once the window is empty', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);

        expect(await tracker.getPauseBeforeMs(200)).toBe(1000);
        vi.setSystemTime(1000);
        expect(await tracker.getPauseBeforeMs(200)).toBeUndefined();
    });

    it('reports how long the window stays over-full when asked about no points', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);

        expect(await tracker.getPauseBeforeMs(0)).toBe(1000);
    });

    it('forgets spend older than the window', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);
        vi.setSystemTime(1000);

        expect(await tracker.getPauseBeforeMs(100)).toBeUndefined();
    });

    it('keeps the refusal pause free of quota bookkeeping', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);

        expect(await tracker.getActiveBackOffUntilTs()).toBeUndefined();
    });

    it('holds nothing back when no quota is configured', async () => {
        const tracker = new PaceTracker('test');
        await tracker.logSuccess(1000);

        expect(await tracker.getPauseBeforeMs(1000)).toBeUndefined();
    });

    it('several small spends that fit together hold nothing back', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(10);
        await tracker.logSuccess(20);
        await tracker.logSuccess(20);
        vi.setSystemTime(500);

        expect(await tracker.getPauseBeforeMs(50)).toBeUndefined();
    });

    it('one more that does not fit waits for the oldest to leave', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(10);
        await tracker.logSuccess(20);
        await tracker.logSuccess(20);
        vi.setSystemTime(500);

        expect(await tracker.getPauseBeforeMs(51)).toBe(500);
    });

});

describe('charging a request when it is sent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('charges a request the moment it is sent', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 200 });
        await tracker.reservePoints(100);

        expect(await tracker.getPauseBeforeMs(150)).toBe(1000);
    });

    it('a refusal after a reservation still counts as the first refusal, not the second', async () => {
        const tracker = new PaceTracker('test', { back_off_calculation: { type: 'exponential' } });
        await tracker.logSuccess(0);
        await tracker.reservePoints(10);
        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(100);
    });

    it('still recognises spend recorded by an earlier version', async () => {
        // Earlier versions recorded a request's cost only once it had succeeded.
        const store: IKvStorage = new MemoryStorage();
        await store.set('fetch_pacer_activity_tracker_test.activities', [{ type: 'success', timestamp: 0, points: 150, id: 'x' }]);
        const tracker = new PaceTracker('test', {
            max_points_per_second: 200,
            storage: { type: 'custom', activity_tracker: (id, options) => new ActivityTrackerKvStorage(id, store, options) }
        });

        expect(await tracker.getPauseBeforeMs(100)).toBe(1000);
    });

    it('assumes a refused request still cost its points', async () => {
        // A service may meter a request it then refuses; assuming it did errs on the safe side.
        const tracker = new PaceTracker('test', { max_points_per_second: 200 });
        await tracker.reservePoints(100);
        await tracker.logBackOff();
        vi.setSystemTime(300);

        expect(await tracker.getActiveBackOffUntilTs()).toBeUndefined();
        expect(await tracker.getPauseBeforeMs(150)).toBe(700);
    });

    it('charges from when the request was sent, not from when the record was stored', async () => {
        const tracker = new PaceTracker('test', {
            max_points_per_second: 200,
            storage: { type: 'custom', activity_tracker: (id, options) => new SlowToStoreTracker(id, options) }
        });

        const charged = tracker.reservePoints(100);
        await vi.advanceTimersByTimeAsync(300);
        await charged;

        expect(await tracker.getPauseBeforeMs(150)).toBe(700);
    });

});

describe('PaceTracker - Reactive Backoff', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });


    it('applies exponential backoff on 429 without jitter', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential' },
        });
        await tracker.logBackOff();
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(100);
    });





    it('increases backoff for consecutive 429s', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential' },
        });

        // 1st backoff: (2^0 * 100ms) = 100ms
        await tracker.logBackOff();
        // 2nd backoff: (2^1 * 100ms) = 200ms
        await tracker.logBackOff();
        // 3rd backoff: (2^2 * 100ms) = 400ms
        await tracker.logBackOff();

        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(400);

    });

    it('starts from the pause the caller chose and doubles from there', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', initial_back_off_ms: 1000 },
        });

        // 1000ms, then 2000ms, then 4000ms, each dated from the refusal just made
        await tracker.logBackOff();
        await tracker.logBackOff();
        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(4000);
    });


    it('increases backoff for consecutive 429s with call gap', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential' },
        });
        await tracker.logBackOff();
        vi.setSystemTime(1000);

        // Now add 200 from latest system time 
        await tracker.logBackOff();
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(1200);
    });


    it('increases backoff for consecutive 429s, but resets after a success', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential' },
        });

        // 1st backoff: (2^0 * 100ms) = 100ms
        await tracker.logBackOff();
        // 2nd backoff: (2^1 * 100ms) = 200ms
        await tracker.logBackOff();

        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(200);

        await tracker.logSuccess(0);

        const newSystemTime = 200;
        vi.setSystemTime(newSystemTime);

        // 1st backoff: (2^0 * 100ms) = 100ms
        await tracker.logBackOff();

        const ts1 = await tracker.getActiveBackOffUntilTs()!;
        expect(ts1).toBe(newSystemTime+100);


    });


    it('should use default 200ms backoff if no back_off_calculation in options and no sequential failures (or 1st failure)', async () => {
        const tracker = new PaceTracker('test');
        
        await tracker.logBackOff();

        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(200);

    });



    it('should cap backoff at max_single_back_off_ms', async () => {
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', max_single_back_off_ms: 250 },
        });

        await tracker.logBackOff(); // 1st back off: 100ms
        await tracker.logBackOff(); // 2nd back off: 200ms.
        await tracker.logBackOff(); // 3rd back off: 400ms.

        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(250);
        
    });



    describe('honors longest back off', () => {
        it('does not reset server backoff on success', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential' },
            });
            await tracker.logBackOff();
            const backoff1 = await tracker.getActiveBackOffUntilTs();
            
            await tracker.logSuccess(10);
            const backoff2 = await tracker.getActiveBackOffUntilTs();
            expect(backoff2).toBe(backoff1);
        });

        it('a refusal never shortens the wait a spend already earned', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential' },
                max_points_per_second: 100,
            });

            await tracker.logSuccess(200);
            expect(await tracker.getPauseBeforeMs(0)).toBe(1000);

            await tracker.logBackOff();
            expect(await tracker.getPauseBeforeMs(0)).toBeGreaterThanOrEqual(1000);
        })

        it('a spend never shortens the wait a refusal already earned', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential', max_single_back_off_ms: 10000 },
                max_points_per_second: 100,
            });

            await tracker.logBackOff(5000);
            await tracker.logSuccess(10);

            expect(await tracker.getPauseBeforeMs(10)).toBe(5000);
        })
    })
    

    describe('minimumBackOffPeriod', () => {

        it('honors forced backoff period', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential', max_single_back_off_ms: 10000 },
            });
            await tracker.logBackOff(5000);
            const ts = await tracker.getActiveBackOffUntilTs();
            expect(ts).toBe(5000);
        });

        it('should use minimumBackOffPeriodMs if it is longer than calculated backoff', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential', max_single_back_off_ms: 10000 },
            });
            const forceMs = 500; // Longer than 100ms (2^0 * 100) for first backoff

            await tracker.logBackOff(forceMs);

            // Calculated exponential would be 100ms. forcedBackOffPeriod from input is 500ms.
            // Effective backoff period = Max(100, 500) = 500ms.

            const ts = await tracker.getActiveBackOffUntilTs();
            expect(ts).toBe(500);

        });


        it('should use calculated backoff if minimumBackOffPeriodMs is shorter or zero', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential', max_single_back_off_ms: 10000 },
            });
            const forceMs = 50; // Shorter than 100ms default

            await tracker.logBackOff(forceMs);

            // Calculated exponential is 100ms. forcedBackOffPeriod from input is 50ms.
            // Effective backoff period = Max(100, 50) = 100ms.

            const ts = await tracker.getActiveBackOffUntilTs();
            expect(ts).toBe(100);

        });


    })

        



});

describe('PaceTracker - Edge Cases', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('getActiveBackOffUntilTs returns undefined when no backoff is set', async () => {
        const tracker = new PaceTracker('test');
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBeUndefined();
    });
});
