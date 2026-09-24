/** A request that was answered successfully. */
export type ActivityItemSuccess = {
    type: 'success';
    /** When it was recorded, in ms since the epoch. */
    timestamp: number;
    /** Cost counted against the quota from `timestamp`; 0 when it was charged as it was sent. */
    points: number;
}
/** A refusal for going too fast, which starts or lengthens the pause every request waits out. */
type ActivityItemBackOff = {
    type: 'back_off',
    /** When the refusal was recorded, in ms since the epoch. */
    timestamp: number;
    /** When the wait the service named ends, if it named one; the pause lasts at least until then. */
    force_back_off_until_at_least_ts?: number
}
/**
 * Spend charged against the quota at the moment a request was sent, before its answer is known.
 *
 * A service meters a request when it arrives, so this is when its cost starts to count, and
 * every pacer sharing the history can see a request that is still in flight.
 */
export type ActivityItemReserved = {
    type: 'reserved';
    /** When the request was sent, in ms since the epoch. */
    timestamp: number;
    points: number;
}
/** One entry in a resource's request history: a charge, a success or a refusal. */
export type ActivityItem = ActivityItemSuccess | ActivityItemBackOff | ActivityItemReserved;

type BaseStoredActivityItem = {
    /** Unique to the entry, assigned when it is stored. */
    id: string;
}
export type StoredActivityItemSuccess = ActivityItemSuccess & BaseStoredActivityItem;
export type StoredActivityItemBackOff = ActivityItemBackOff & BaseStoredActivityItem;
export type StoredActivityItemReserved = ActivityItemReserved & BaseStoredActivityItem;

/** An entry as kept in the history, with the id it was stored under. */
export type StoredActivityItem = StoredActivityItemSuccess | StoredActivityItemBackOff | StoredActivityItemReserved;

export type SetBackOffUntilTsOptions = {
    /**
     * Keep a later end already stored, so the pause can only ever be lengthened.
     */
    onlyIfExceedsCurrentTs?: boolean
}

/**
 * Keeps a resource's request history, which a pacer reads to decide how long to hold requests back.
 *
 * The history holds what was charged, what succeeded and what was refused, plus one shared
 * refusal pause. Trackers given the same `id` over the same durable store share it, so pacers in
 * different tabs or workers spend from one quota. Implement this to keep the history somewhere
 * the built-in trackers do not reach, and pass it as `storage: { type: 'custom', activity_tracker }`.
 *
 * @example
 * const pacer = new FetchPacer('mail-api', {
 *     max_points_per_second: 250,
 *     storage: { type: 'custom', activity_tracker: (id, options) => new ActivityTrackerKvStorage(id, myStore, options) }
 * });
 */
export interface IActivityTracker {
    /**
     * Records one entry in the history: a charge, a success or a refusal.
     *
     * @param activity What happened, and when.
     * @returns Once the entry is stored, so a `list` that starts afterwards includes it.
     */
    add(activity: ActivityItem): Promise<void>;

    /**
     * Notes whether the owner is in use: a pacer sets it while it has requests queued. A tracker
     * may use it to do less while idle; pacing does not depend on it.
     *
     * @param active Whether the owner is in use.
     */
    setActive(active: boolean): Promise<void>;

    /** Whether the owner last reported itself in use (see `setActive`). */
    isActive():Promise<boolean>;

    /**
     * Sets when the shared refusal pause ends, holding every request back until then.
     *
     * @param ts When the pause ends, in ms since the epoch.
     * @param options `onlyIfExceedsCurrentTs` keeps a later end already stored.
     */
    setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void>;

    /** When the shared refusal pause ends, in ms since the epoch; `undefined` or a past moment when none is in force. */
    getBackOffUntilTs(): Promise<number | undefined>;

    /**
     * The history within the retention period, from every tracker sharing it.
     *
     * @returns Entries oldest first. The count of refusals since the last success relies on
     * this order.
     */
    list(): Promise<StoredActivityItem[]>

    /**
     * Releases whatever the tracker holds. Entries already stored stay, for other trackers
     * sharing the history to read.
     */
    dispose(): Promise<void>;
}

/** How a tracker keeps its history. */
export type ActivityTrackerOptions = {
    /**
     * How long an entry is kept, in ms. Defaults to 2 minutes; pacers always ask for 5.
     *
     * Must be at least the length of the quota window, and the same for every tracker sharing
     * a history.
     */
    clear_activities_older_than_ms?: number
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
    getActiveBackOffUntilTs(): Promise<number | undefined>;

    /**
     * How much longer the pause that a refusal earned lasts (see `getActiveBackOffUntilTs`).
     *
     * @returns The remaining pause in ms, or `undefined` when no refusal pause is in force.
     */
    getActiveBackOffForMs(): Promise<number | undefined>;

    /**
     * How long to hold back a request costing `points` before sending it.
     *
     * A request is held back while a refusal pause is in force (see `logBackOff`), or while the
     * quota's one-second window has too little room left for it. Room comes back as earlier
     * spend drops out of the window, so the wait lasts only until enough of it has left.
     *
     * @param points What the request will cost. Asking about 0 tells whether anything at all is
     * being held back.
     * @returns The wait in ms, or `undefined` when the request may be sent now.
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

    /**
     * Clean up any resources (e.g. storage handles).
     */
    dispose(): Promise<void>;
}
