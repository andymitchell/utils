import type { QuotaSpend, QuotaWindow } from '../pace-tracker-types.ts';

/**
 * The earliest moment a request costing `points` fits inside every quota window, given what has
 * already been spent.
 *
 * A quota such as "100 points per second" is a sliding window: at any moment, the spend in the
 * last second must stay within 100. Spend drops out of the window exactly `per_ms` after it
 * happened, so a request that does not fit now fits as soon as enough earlier spend has
 * dropped out. This finds that moment.
 *
 * @param spends What has been spent, in any order. Entries of 0 points or less are ignored.
 * @param points What the request would cost.
 * @param windows Every limit the request must fit within. With none, it fits at once.
 * @param now The current time, in ms since the epoch.
 * @returns `now` when the request fits already; otherwise the moment the last spend in its way
 * drops out of the window. Never earlier than `now`.
 *
 * @example
 * // 60 points were spent at 9_500; 50 more would exceed 100 per second until those 60 drop out.
 * earliestAdmissibleTs([{ timestamp: 9_500, points: 60 }], 50, [{ points: 100, per_ms: 1000 }], 10_000);
 * // => 10_500
 *
 * @remarks
 * A spend counts while `timestamp > t − per_ms`: it drops out at exactly `timestamp + per_ms`.
 *
 * A request larger than a whole window can never fit alongside other spend, so it is allowed
 * once that window is empty: a single oversized request goes through rather than never.
 * Likewise, asking about 0 points answers "is the window over-full right now?", which only
 * happens after an oversized request.
 *
 * Nothing new is spent while waiting, so a window's spend only ever falls as time passes. That
 * is why the first moment the request fits stays a moment it fits, and why the answer across
 * several windows is simply the latest of the per-window answers.
 */
export function earliestAdmissibleTs(spends: readonly QuotaSpend[], points: number, windows: readonly QuotaWindow[], now: number): number {
    return windows.reduce((latest, window) => Math.max(latest, earliestAdmissibleTsInWindow(spends, points, window, now)), now);
}

function earliestAdmissibleTsInWindow(spends: readonly QuotaSpend[], points: number, window: QuotaWindow, now: number): number {
    // `filter` makes a new array, so sorting it leaves the caller's untouched.
    const inWindow = spends
        .filter(spend => spend.points > 0 && spend.timestamp > now - window.per_ms)
        .sort((a, b) => a.timestamp - b.timestamp);

    let used = inWindow.reduce((sum, spend) => sum + spend.points, 0);
    if (used + points <= window.points) return now;

    for (const spend of inWindow) {
        used -= spend.points;
        if (used + points <= window.points) return spend.timestamp + window.per_ms;
    }

    // Only reached when the request is larger than the whole window: it goes once the window is empty.
    const newest = inWindow.at(-1);
    return newest === undefined ? now : newest.timestamp + window.per_ms;
}
