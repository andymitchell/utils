/** A request that was answered successfully. */
export type ActivityItemSuccess = {
    type: 'success';
    /** When it was recorded, in ms since the epoch. */
    timestamp: number;
    /** Cost counted against the quota from `timestamp`; 0 when it was charged as it was sent. */
    points: number;
}
/** A refusal for going too fast, which starts or lengthens the pause every request waits out. */
export type ActivityItemBackOff = {
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
     * @returns Entries oldest first. The back-off counts refusals by their place in this order,
     * so entries one tracker added with the same timestamp keep the order they were added in.
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
     * How long an entry is kept, in ms. Pacers always ask for 5 minutes.
     *
     * Must be at least the length of the quota window, and the same for every tracker sharing
     * a history.
     *
     * @default 120000 (2 minutes)
     */
    clear_activities_older_than_ms?: number
}
