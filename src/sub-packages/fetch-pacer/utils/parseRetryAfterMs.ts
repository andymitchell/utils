/** A count of whole seconds, which is the shorter of the two forms a service may reply with. */
const DELTA_SECONDS = /^\d+$/;

/**
 * Every legal spelling of the dated form carries a day, month or zone name.
 *
 * Without this, date parsing quietly accepts a bare `-5` or `1.5` as a year in the distant
 * past, which then reads as "retry immediately" — the opposite of what was asked.
 */
const NAMES_A_MOMENT = /[a-z]/i;

/**
 * Read a `Retry-After` header into a number of milliseconds to wait.
 *
 * A service that is turning requests away often says when it is willing to be asked again. It
 * may do so either as a count of seconds (`120`) or as the moment to resume (`Wed, 21 Oct 2015
 * 07:28:00 GMT`); both mean the same thing and this reads either.
 *
 * Knowing the real answer matters because the alternative is guessing. A client that guesses
 * short keeps being turned away, and one that guesses long stays idle after the service had
 * recovered.
 *
 * @param headerValue The raw header, exactly as it arrived. `null` when the service sent none.
 * @param now The moment to measure a dated reply against. Defaults to the current time.
 * @returns The wait in milliseconds, never negative; or `undefined` when the service gave
 * nothing usable, in which case the caller should fall back to its own calculation.
 *
 * @example
 * parseRetryAfterMs('120');                              // 120000
 * parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT');    // ms from now until then, or 0 if passed
 * parseRetryAfterMs(null);                               // undefined
 *
 * @remarks
 * A moment that has already passed reads as `0` rather than as a negative wait, since a slow
 * hop or a clock that disagrees should not be able to propose retrying in the past.
 *
 * Anything that is neither form — including a negative or fractional count — is treated as
 * absent. Interpreting a malformed value risks retrying sooner than the service was willing
 * to be asked, which is the one outcome worth ruling out.
 */
export function parseRetryAfterMs(headerValue: string | null | undefined, now: number = Date.now()): number | undefined {

    if (typeof headerValue !== 'string') return undefined;

    const value = headerValue.trim();
    if (!value) return undefined;

    if (DELTA_SECONDS.test(value)) {
        return Number(value) * 1000;
    }

    if (!NAMES_A_MOMENT.test(value)) return undefined;

    const resumeAt = Date.parse(value);
    if (Number.isNaN(resumeAt)) return undefined;

    return Math.max(0, resumeAt - now);
}
