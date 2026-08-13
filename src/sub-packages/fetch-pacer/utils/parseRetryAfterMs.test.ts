import { describe, it, expect } from 'vitest';

import { parseRetryAfterMs } from './parseRetryAfterMs.ts';

/** A fixed point to measure a dated instruction against, so the tests do not depend on the clock. */
const NOW = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');

describe('reading how long a service asked us to wait', () => {

    describe('when it counts in seconds', () => {

        it('converts the seconds it named into milliseconds', () => {
            expect(parseRetryAfterMs('120', NOW)).toBe(120_000);
        });

        it('reads a request to come back immediately as no wait at all', () => {
            expect(parseRetryAfterMs('0', NOW)).toBe(0);
        });

        it('ignores space around the number, which servers add freely', () => {
            expect(parseRetryAfterMs('  30  ', NOW)).toBe(30_000);
        });

        it('handles a wait long enough to be worth trusting over a guess', () => {
            expect(parseRetryAfterMs('3600', NOW)).toBe(3_600_000);
        });

    });

    describe('when it names a moment', () => {

        it('measures the wait from now until the moment named', () => {
            expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:29:00 GMT', NOW)).toBe(60_000);
        });

        it('treats a moment already passed as no wait at all', () => {
            // A slow hop, or a clock that disagrees, should not produce a negative pause.
            expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:27:00 GMT', NOW)).toBe(0);
        });

        it('treats the current moment as no wait at all', () => {
            expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', NOW)).toBe(0);
        });

    });

    describe('when there is nothing usable to read', () => {

        it('has no opinion when the service said nothing', () => {
            expect(parseRetryAfterMs(null, NOW)).toBeUndefined();
        });

        it('has no opinion when the value is empty', () => {
            expect(parseRetryAfterMs('   ', NOW)).toBeUndefined();
        });

        it('has no opinion when the value is neither a count nor a date', () => {
            expect(parseRetryAfterMs('soon', NOW)).toBeUndefined();
        });

        it('has no opinion when the count is negative', () => {
            // Only a non-negative count is meaningful, and guessing at intent here would
            // risk retrying sooner than the service was willing to be asked.
            expect(parseRetryAfterMs('-5', NOW)).toBeUndefined();
        });

        it('has no opinion when the count is fractional', () => {
            expect(parseRetryAfterMs('1.5', NOW)).toBeUndefined();
        });

    });

    it('never proposes waiting less than the caller could work out alone', () => {
        // Whatever form it arrives in, the answer is either a usable pause or nothing.
        for (const value of ['120', 'Wed, 21 Oct 2015 07:29:00 GMT', 'soon', '-5', null]) {
            const parsed = parseRetryAfterMs(value, NOW);
            if (parsed !== undefined) expect(parsed).toBeGreaterThanOrEqual(0);
        }
    });

});
