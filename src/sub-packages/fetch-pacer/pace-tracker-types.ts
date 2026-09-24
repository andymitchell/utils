import type { ActivityTrackerOptions, IActivityTracker } from "./activity-tracker-types.ts";

/** Points spent by one request, and when. */
export type QuotaSpend = {
    /** When the points were spent, in ms since the epoch. */
    readonly timestamp: number;
    readonly points: number;
};

/** A limit on spend: at most `points` within any stretch of `per_ms` milliseconds. */
export type QuotaWindow = {
    readonly points: number;
    readonly per_ms: number;
};

/** How a tracker paces requests: the quota, the pause after a refusal, and where history is kept. */
export type PaceTrackerOptions = {
    /**
     * The quota: the most points that may be spent within any one second.
     *
     * A request's points count from the moment it is sent until one second later. A request
     * waits only until enough earlier spend has dropped out of that second for it to fit; one
     * larger than the whole quota goes once nothing else is in the window.
     *
     * If omitted, requests are never held back for their cost, only while a refusal pause is
     * in force.
     */
    max_points_per_second?: number;

    /**
     * How long to pause every request after the service refuses one for going too fast.
     *
     * Without it, each refusal pauses for 200ms. A longer wait named by the service
     * (`Retry-After`, or `minimumMs` from `treat_as_back_off`) is always followed.
     */
    back_off_calculation?: {
        /** Start at `initial_back_off_ms`, and double with each refusal until the next success. */
        type: 'exponential',

        /**
         * The pause after the first refusal in a run, in milliseconds. Defaults to 100.
         *
         * Each further refusal before the next success doubles it: from the default, 100, then
         * 200, then 400, and so on.
         *
         * @remarks
         * A longer wait named by the service is still followed, and the pause never grows past
         * `max_single_back_off_ms`.
         */
        initial_back_off_ms?: number,

        /**
         * Vary each calculated pause by up to a fifth, either side of its calculated length.
         *
         * Clients that back off at the same moment otherwise return at the same moment, and
         * hit the service with the very burst the back-off existed to break up. Varying the
         * pause staggers their return.
         *
         * @remarks
         * The variation runs in both directions, so across many clients the average wait is
         * still the calculated one. It never applies to a pause the service named itself
         * (see `logBackOff`'s minimum period), which is followed exactly.
         */
        jitter?: boolean,

        /**
         * The longest single pause that may be asked for, in milliseconds. Defaults to 5 minutes.
         *
         * Exponential growth reaches unhelpful lengths quickly once a service keeps refusing;
         * this is the point past which waiting longer stops being useful.
         */
        max_single_back_off_ms?: number
    },

    /**
     * Where the history of spend and refusals is kept. Defaults to `memory`.
     *
     * Use durable storage to keep pacing across restarts of a short-lived context (such as a
     * service worker), or to share one quota between several clients.
     */
    storage?: {
        type: 'memory'
    } | {
        type: 'browser-local'
    } | {
        type: 'custom',
        activity_tracker: (id: string, options?: ActivityTrackerOptions) => IActivityTracker
    }

}

/**
 * Decides how long each request waits, from a resource's history of spend and refusals.
 *
 * A pacer asks it before every send (`getPauseBeforeMs`), charges the request as it goes
 * (`reservePoints`), and reports how it was answered (`logSuccess` or `logBackOff`).
 */
export interface IPaceTracker {
    /**
     * When the pause that a refusal earned comes to an end.
     *
     * A refusal (see `logBackOff`) holds every request back until then, however much quota is
     * left. Spending never sets this pause.
     *
     * @returns The end of the pause in ms since the epoch, or `undefined` when no refusal pause
     * is in force.
     */
    getRefusalPauseUntilTs(): Promise<number | undefined>;

    /**
     * How long to hold back a request costing `points` before sending it.
     *
     * A request is held back while a refusal pause is in force (see `logBackOff`), or while the
     * quota's one-second window has too little room left for it. Room comes back as earlier
     * spend drops out of the window, so the wait lasts only until enough of it has left.
     *
     * @param points What the request will cost. Asking about 0 tells whether anything at all is
     * being held back.
     * @returns The wait in ms, counted from the moment the answer is given however long reading
     * the history took, or `undefined` when the request may be sent now.
     *
     * @example
     * // 100 points per second, and 60 were spent 400ms ago
     * await tracker.getPauseBeforeMs(40); // => undefined: it fits already
     * await tracker.getPauseBeforeMs(50); // => 600: once those 60 leave the window
     *
     * @remarks
     * A request larger than the whole quota can never fit beside other spend, so it is let
     * through once the window is empty rather than never.
     */
    getPauseBeforeMs(points: number): Promise<number | undefined>;

    /**
     * Charges a request's cost against the quota as it is sent.
     *
     * A service meters a request when it arrives, so the charge is dated from the moment of this
     * call, however long storing it takes. From then on every pacer sharing this history counts
     * it, including while the request still awaits its answer. The charge stands whatever the
     * answer, since a refused request may still have been metered.
     *
     * @param points The cost of the request, in points.
     *
     * @example
     * const charged = tracker.reservePoints(5); // dated now
     * const response = await fetch(url);
     * await charged;
     * if( response.ok ) await tracker.logSuccess(0); // already charged
     *
     * @remarks
     * Pacers sharing a history do not coordinate their checks. Two that each check while the
     * other's charge is still being stored can both find room and both send; the window then
     * reads over-full and both hold back until it drains. Each such coincidence can overshoot
     * the quota by at most one request per pacer.
     */
    reservePoints(points: number): Promise<void>;

    /**
     * Records a request that succeeded.
     *
     * `points` count against the quota until they drop out of the one-second window; pass 0 when
     * the cost was already charged with `reservePoints`. A success also ends a run of refusals,
     * so the next refusal is treated as the first.
     *
     * @param points Cost not yet charged, in points.
     *
     * @remarks
     * A success recorded in the same instant as another pacer's refusal does not end that
     * refusal's run: it was most likely let in before the limit was hit.
     */
    logSuccess(points: number): Promise<void>;

    /**
     * Records a refusal for going too fast, and pauses every request sharing this history.
     *
     * The pause is the pacer's own estimate. With an exponential `back_off_calculation` it starts
     * at `initial_back_off_ms` and doubles with each refusal since the last success, up to
     * `max_single_back_off_ms`; without one it is 200ms. A pause already in force is never
     * shortened.
     *
     * @param minimumBackOffPeriodMs The wait the service named, in ms, if it named one. The pause
     * lasts at least this long, and jitter never shortens it.
     *
     * @example
     * await tracker.logBackOff();       // a plain 429: the pacer works out the wait
     * await tracker.logBackOff(30_000); // the service sent `Retry-After: 30`
     */
    logBackOff(minimumBackOffPeriodMs?: number): Promise<void>;

    /**
     * Notes whether the owner has requests under way, and passes it on to the history's tracker.
     * Pacing itself does not change.
     *
     * @param active Whether requests are under way.
     */
    setActive(active: boolean): Promise<void>;

    /** Whether the owner last reported requests under way (see `setActive`). */
    isActive(): Promise<boolean>;

    /** Releases what the history's tracker holds, such as storage handles. */
    dispose(): Promise<void>;
}
