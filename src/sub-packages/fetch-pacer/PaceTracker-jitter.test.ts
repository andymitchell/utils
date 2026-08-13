import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import PaceTracker from './PaceTracker.ts';

/**
 * Pins the random draw so a spread that is deliberately unpredictable can still be asserted
 * exactly. `0` is the furthest draw below the calculated pause, `1` the furthest above, and
 * `0.5` lands precisely on it.
 */
function drawJitterAt(fraction: number): void {
    vi.spyOn(Math, 'random').mockReturnValue(fraction);
}

/** The pause a first back-off earns before any spreading is applied. */
const FIRST_BACK_OFF_MS = 100;

describe('spreading out when a fleet backs off together', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('can return sooner than the calculated pause', async () => {
        drawJitterAt(0);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(80);
    });

    it('can return later than the calculated pause', async () => {
        drawJitterAt(1);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(120);
    });

    it('lands on the calculated pause when the draw is neutral', async () => {
        drawJitterAt(0.5);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(FIRST_BACK_OFF_MS);
    });

    it('stays within a fifth of the calculated pause, whichever way it is drawn', async () => {
        // Spreading either side means the average client waits what was calculated. Spreading
        // only upwards would make every client in the fleet wait longer than intended.
        const observed: number[] = [];

        for (const draw of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
            vi.setSystemTime(0);
            drawJitterAt(draw);
            const tracker = new PaceTracker(`test-${draw}`, {
                back_off_calculation: { type: 'exponential', jitter: true }
            });

            await tracker.logBackOff();
            observed.push((await tracker.getActiveBackOffUntilTs())!);
        }

        for (const pause of observed) {
            expect(pause).toBeGreaterThanOrEqual(FIRST_BACK_OFF_MS * 0.8);
            expect(pause).toBeLessThanOrEqual(FIRST_BACK_OFF_MS * 1.2);
        }
        // The draws must actually produce a spread, or the assertion above proves nothing.
        expect(new Set(observed).size).toBeGreaterThan(1);
    });

    it('never spreads past the longest pause it is allowed to ask for', async () => {
        drawJitterAt(1);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true, max_single_back_off_ms: 50 }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(50);
    });

    it('still reaches the ceiling rather than stopping short of it', async () => {
        // Spreading downwards from the ceiling would quietly lower the longest pause the
        // caller configured, so a run at the limit backs off less than it was told to.
        drawJitterAt(0.5);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true, max_single_back_off_ms: 50 }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(50);
    });

    it('waits exactly as long as the service asked, without spreading that', async () => {
        // A service naming a time is an instruction, not an estimate: the spread applies to
        // pauses this client worked out for itself.
        drawJitterAt(0);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential', jitter: true }
        });

        await tracker.logBackOff(30_000);

        expect(await tracker.getActiveBackOffUntilTs()).toBe(30_000);
    });

    it('leaves the pause alone when spreading was never asked for', async () => {
        drawJitterAt(0);
        const tracker = new PaceTracker('test', {
            back_off_calculation: { type: 'exponential' }
        });

        await tracker.logBackOff();

        expect(await tracker.getActiveBackOffUntilTs()).toBe(FIRST_BACK_OFF_MS);
    });

});
