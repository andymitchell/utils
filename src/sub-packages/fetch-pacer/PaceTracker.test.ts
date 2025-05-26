import { describe, it, expect, beforeEach, afterEach, vi, type MockedClass, type Mocked } from 'vitest';
import PaceTracker from './PaceTracker.ts';


describe('PaceTracker - Proactive Pacing', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return undefined if no backoff is active', async () => {
        const tracker = new PaceTracker('test');
        
        expect(await tracker.getActiveBackOffUntilTs()).toBeUndefined();
    });


    it('sets backoff to return quota points to 0', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(10);
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(100); // 100 is 10% of the period (1000)
    });
    
    it('sets backoff when usage exceeds max points per second', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBe(2000);
    });

    it('does not decrease existing backoff on subsequent smaller usage', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);
        const firstBackoff = await tracker.getActiveBackOffUntilTs();
        if( firstBackoff===undefined ) throw new Error("noop");
        
        await tracker.logSuccess(50);
        const secondBackoff = await tracker.getActiveBackOffUntilTs();
        expect(secondBackoff).toBeGreaterThanOrEqual(firstBackoff);
    });

    it('clears backoff after expiration', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(200);
        vi.setSystemTime(3000);
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBeUndefined();
    });

    it('should not set a pacing backoff if max_points_per_second is not configured', async () => {
            const tracker = new PaceTracker('test')// No max_points_per_second
            await tracker.logSuccess(1000);
            const ts = await tracker.getActiveBackOffUntilTs();
            expect(ts).toBeUndefined();
        });


    describe('use windows longer than last 1 second', () => {
        it('sets backoff when multiple excess points used over 3 seconds', async () => {
            const tracker = new PaceTracker('test', { max_points_per_second: 100 });
            await tracker.logSuccess(200); // 2000ms wait
            vi.setSystemTime(1000);
            await tracker.logSuccess(200); // 2000ms wait
            const finalSystemTime = 2000;
            vi.setSystemTime(finalSystemTime);
            await tracker.logSuccess(200); // 2000ms wait

            // It used 3x2000ms (6000ms) worth of points in rapid succession, so it has to wait 6s to reset

            const ts = await tracker.getActiveBackOffUntilTs();
            expect(ts).toBe(finalSystemTime+6000);
        });
    })
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

        it('long points back off not affected by server back off', async () => {
            const tracker = new PaceTracker('test', {
                back_off_calculation: { type: 'exponential' },
                max_points_per_second: 100,
            });

            await tracker.logSuccess(200);

            const backoff1 = await tracker.getActiveBackOffUntilTs();
            
            
            await tracker.logBackOff();
            const backoff2 = await tracker.getActiveBackOffUntilTs();
            expect(backoff2).toBe(backoff1);
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

    it('multiple rapid small successes do not trigger exponential backoff', async () => {
        const tracker = new PaceTracker('test', { max_points_per_second: 100 });
        await tracker.logSuccess(10);
        await tracker.logSuccess(20);
        await tracker.logSuccess(20);
        vi.setSystemTime(500); // The expected time for point usage
        const ts = await tracker.getActiveBackOffUntilTs();
        expect(ts).toBeUndefined();
    });
});
