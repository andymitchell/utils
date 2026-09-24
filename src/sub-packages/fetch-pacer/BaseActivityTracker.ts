import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from './activity-tracker-types.ts';

/** What a tracker uses for each option the caller leaves out. */
const activityTrackerOptionsDefault = Object.freeze({
    clear_activities_older_than_ms: 1000*60*2
} satisfies Required<ActivityTrackerOptions>);

/**
 * The groundwork every activity tracker shares: its options with defaults filled in, the rule
 * for when an entry has aged out, and the record of whether its owner is in use.
 *
 * A subclass decides where the history and the refusal pause are kept, by implementing `add`,
 * `list`, `setBackOffUntilTs` and `getBackOffUntilTs`.
 */
export abstract class BaseActivityTracker implements IActivityTracker {

    /** The options given, with a default for each one left out. */
    protected readonly options: Required<ActivityTrackerOptions>;
    #active = true;

    /**
     * @param options How long history is kept; anything left out comes from the defaults (see
     * {@link ActivityTrackerOptions}).
     */
    constructor(options?: ActivityTrackerOptions) {
        this.options = { ...activityTrackerOptionsDefault, ...options };
    }

    abstract add(activity: ActivityItem): Promise<void>;

    abstract list(): Promise<StoredActivityItem[]>;

    abstract setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void>;

    abstract getBackOffUntilTs(): Promise<number | undefined>;

    async isActive(): Promise<boolean> {
        return this.#active;
    }

    /**
     * Notes whether the owner is in use. It is only recorded: nothing here does more or less
     * while the owner is idle.
     *
     * @param active Whether the owner is in use.
     */
    async setActive(active: boolean): Promise<void> {
        this.#active = active;
    }

    /** Marks the owner as no longer in use. Entries already stored stay, for others sharing the history. */
    async dispose(): Promise<void> {
        this.#active = false;
    }

    /**
     * The entries that still count: those stamped within the last `clear_activities_older_than_ms`.
     *
     * @param activities Entries in any order.
     * @returns A new array of the entries still within the retention period, in the order given.
     */
    protected discardOldActivities<T extends ActivityItem>(activities: readonly T[]): T[] {
        const now = Date.now();
        return activities.filter(
            item => now - item.timestamp <= this.options.clear_activities_older_than_ms
        );
    }
}
