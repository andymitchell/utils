import { describe, expect, it } from 'vitest';

import { earliestAdmissibleTs } from './earliestAdmissibleTs.ts';
import type { QuotaSpend, QuotaWindow } from '../types.ts';
import { mulberry32 } from '../testing-utils/mulberry32.ts';

const NOW = 10_000;
const HUNDRED_PER_SECOND: QuotaWindow = { points: 100, per_ms: 1000 };
const spend = (timestamp: number, points: number): QuotaSpend => ({ timestamp, points });

describe('finding the earliest moment a request fits inside every quota window', () => {

    it('lets a request go at once when nothing has been spent', () => {
        expect(earliestAdmissibleTs([], 50, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
    });

    it('lets anything go at once when there is no quota', () => {
        expect(earliestAdmissibleTs([spend(9500, 1000)], 1000, [], NOW)).toBe(NOW);
    });

    it('lets a request go at once when it exactly fills what is left', () => {
        expect(earliestAdmissibleTs([spend(9500, 60)], 40, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
    });

    it('holds a request back until the spend in its way leaves the window', () => {
        expect(earliestAdmissibleTs([spend(9500, 60)], 50, [HUNDRED_PER_SECOND], NOW)).toBe(9500 + 1000);
    });

    it('waits only for as much earlier spend to leave as it needs', () => {
        expect(earliestAdmissibleTs([spend(9200, 30), spend(9600, 40)], 90, [HUNDRED_PER_SECOND], NOW)).toBe(9600 + 1000);
        expect(earliestAdmissibleTs([spend(9200, 30), spend(9600, 40)], 60, [HUNDRED_PER_SECOND], NOW)).toBe(9200 + 1000);
    });

    it('treats spend from exactly one window ago as already gone', () => {
        expect(earliestAdmissibleTs([spend(NOW - 1000, 100)], 100, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
        expect(earliestAdmissibleTs([spend(NOW - 999, 100)], 100, [HUNDRED_PER_SECOND], NOW)).toBe(NOW - 999 + 1000);
    });

    describe('a request larger than the whole quota', () => {

        it('goes once everything in the window has left', () => {
            expect(earliestAdmissibleTs([spend(9200, 30), spend(9600, 40)], 150, [HUNDRED_PER_SECOND], NOW)).toBe(9600 + 1000);
        });

        it('goes at once when the window is empty', () => {
            expect(earliestAdmissibleTs([spend(8000, 100)], 150, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
        });

        it('goes at once when all that is left in the window spent nothing', () => {
            expect(earliestAdmissibleTs([spend(9500, 0)], 150, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
        });

        it('never waits on a request that spent nothing', () => {
            // Requests with no stated cost are recorded as 0 points; they take no room in the window.
            expect(earliestAdmissibleTs([spend(9200, 100), spend(9800, 0)], 150, [HUNDRED_PER_SECOND], NOW)).toBe(9200 + 1000);
        });

    });

    it('reports a window as full for a free request only once it is over-full', () => {
        expect(earliestAdmissibleTs([spend(9500, 100)], 0, [HUNDRED_PER_SECOND], NOW)).toBe(NOW);
        expect(earliestAdmissibleTs([spend(9500, 150)], 0, [HUNDRED_PER_SECOND], NOW)).toBe(10_500);
    });

    it('lets spends made at the same moment leave together', () => {
        expect(earliestAdmissibleTs([spend(9500, 50), spend(9500, 50)], 100, [HUNDRED_PER_SECOND], NOW)).toBe(9500 + 1000);
    });

    it('gives the same answer whatever order the spend is listed in, leaving the list untouched', () => {
        const outOfOrder = Object.freeze([spend(9600, 40), spend(9200, 30)]);

        expect(earliestAdmissibleTs(outOfOrder, 60, [HUNDRED_PER_SECOND], NOW))
            .toBe(earliestAdmissibleTs([spend(9200, 30), spend(9600, 40)], 60, [HUNDRED_PER_SECOND], NOW));
        expect(outOfOrder).toEqual([spend(9600, 40), spend(9200, 30)]);
    });

    it('waits until the request fits every quota at once', () => {
        const perFiveSeconds: QuotaWindow = { points: 150, per_ms: 5000 };
        const spends = [spend(6000, 80), spend(9500, 60)];

        const shortWindowOnly = earliestAdmissibleTs(spends, 50, [HUNDRED_PER_SECOND], NOW);
        const longWindowOnly = earliestAdmissibleTs(spends, 50, [perFiveSeconds], NOW);

        expect(shortWindowOnly).toBe(10_500);
        expect(longWindowOnly).toBe(11_000);
        expect(earliestAdmissibleTs(spends, 50, [HUNDRED_PER_SECOND, perFiveSeconds], NOW)).toBe(11_000);
    });

    it('counts spend stamped slightly in the future, and lets it leave a window after its stamp', () => {
        // Writers sharing a store can have clocks that disagree by a little.
        expect(earliestAdmissibleTs([spend(10_200, 100)], 50, [HUNDRED_PER_SECOND], NOW)).toBe(11_200);
    });

    it('never waits on spend that has already left the window', () => {
        expect(earliestAdmissibleTs([spend(8000, 100), spend(9500, 60)], 50, [HUNDRED_PER_SECOND], NOW)).toBe(10_500);
    });

});

type Scenario = { spends: QuotaSpend[]; points: number; windows: QuotaWindow[]; now: number };

function randomScenario(seed: number): Scenario {
    const random = mulberry32(seed);
    const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

    const windows = Array.from({ length: between(1, 2) }, () => ({ points: between(1, 200), per_ms: between(50, 1000) }));
    const longest = Math.max(...windows.map(window => window.per_ms));
    const largest = Math.max(...windows.map(window => window.points));
    const now = between(0, 1_000_000);
    const spends = Array.from({ length: between(0, 20) }, () => spend(between(now - 3 * longest, now), between(0, 2 * largest)));

    return { spends, points: between(0, 2 * largest), windows, now };
}

/** Whether the request fits at `t`, straight from the definition of a sliding window. */
function fitsAt({ spends, points, windows }: Scenario, t: number): boolean {
    return windows.every(window => {
        const inWindow = spends
            .filter(item => item.points > 0 && item.timestamp > t - window.per_ms)
            .reduce((sum, item) => sum + item.points, 0);
        return points > window.points ? inWindow === 0 : inWindow + points <= window.points;
    });
}

/** Tries every millisecond from `now` until the request fits. */
function bruteForce(scenario: Scenario): number {
    const horizon = Math.max(scenario.now, ...scenario.spends.map(item => item.timestamp)) + Math.max(...scenario.windows.map(window => window.per_ms));
    for (let t = scenario.now; t <= horizon; t++) {
        if (fitsAt(scenario, t)) return t;
    }
    throw new Error(`Nothing fits before ${horizon}`);
}

const answer = ({ spends, points, windows, now }: Scenario) => earliestAdmissibleTs(spends, points, windows, now);

const SCENARIOS = Array.from({ length: 300 }, (_, i) => ({ seed: i + 1, scenario: randomScenario(i + 1) }));

describe('properties that hold for any history', () => {

    it('matches trying every millisecond in turn', () => {
        for (const { seed, scenario } of SCENARIOS) {
            expect(answer(scenario), `seed ${seed}`).toBe(bruteForce(scenario));
        }
    });

    it('is never earlier than now', () => {
        for (const { seed, scenario } of SCENARIOS) {
            expect(answer(scenario), `seed ${seed}`).toBeGreaterThanOrEqual(scenario.now);
        }
    });

    it('is a moment the request fits, and the moment before it is not', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const result = answer(scenario);
            expect(fitsAt(scenario, result), `seed ${seed}`).toBe(true);
            if (result > scenario.now) expect(fitsAt(scenario, result - 1), `seed ${seed}`).toBe(false);
        }
    });

    it('never lets a costlier request go sooner', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const costlier = { ...scenario, points: scenario.points + 1 + (seed % 50) };
            expect(answer(costlier), `seed ${seed}`).toBeGreaterThanOrEqual(answer(scenario));
        }
    });

    it('never lets a request go sooner because more was spent', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const window = scenario.windows[0]!;
            const extra = spend(scenario.now - Math.floor(window.per_ms / 2), 1 + (seed % window.points));
            const busier = { ...scenario, spends: [...scenario.spends, extra] };
            expect(answer(busier), `seed ${seed}`).toBeGreaterThanOrEqual(answer(scenario));
        }
    });

    it('gives the answer asked earlier, or now if that has passed, when asked again later', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const later = scenario.now + 1 + (seed % 1500);
            expect(answer({ ...scenario, now: later }), `seed ${seed}`).toBe(Math.max(later, answer(scenario)));
        }
    });

    it('does not depend on the order the spend is listed in', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const shuffle = mulberry32(seed * 7919);
            const shuffled = [...scenario.spends]
                .map(item => ({ item, key: shuffle() }))
                .sort((a, b) => a.key - b.key)
                .map(({ item }) => item);
            expect(answer({ ...scenario, spends: shuffled }), `seed ${seed}`).toBe(answer(scenario));
            expect(answer({ ...scenario, spends: [...scenario.spends].reverse() }), `seed ${seed}`).toBe(answer(scenario));
        }
    });

    it('waits for the strictest of several quotas', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const perWindow = scenario.windows.map(window => answer({ ...scenario, windows: [window] }));
            expect(answer(scenario), `seed ${seed}`).toBe(Math.max(...perWindow));
        }
    });

    it('moves with the clock: shifting every time shifts the answer by the same amount', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const shift = 12_345;
            const shifted = {
                ...scenario,
                now: scenario.now + shift,
                spends: scenario.spends.map(item => spend(item.timestamp + shift, item.points))
            };
            expect(answer(shifted), `seed ${seed}`).toBe(answer(scenario) + shift);
        }
    });

    it('does not depend on the unit points are counted in', () => {
        for (const { seed, scenario } of SCENARIOS) {
            const scale = 3;
            const scaled = {
                ...scenario,
                points: scenario.points * scale,
                spends: scenario.spends.map(item => spend(item.timestamp, item.points * scale)),
                windows: scenario.windows.map(window => ({ ...window, points: window.points * scale }))
            };
            expect(answer(scaled), `seed ${seed}`).toBe(answer(scenario));
        }
    });

});
