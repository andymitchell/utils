import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from '../activity-tracker-types.ts';

import { BaseActivityTracker } from '../BaseActivityTracker.ts';
import { parseSegmentKey, segmentKey, storageKeysFor, type StorageKeys } from './storageKeys.ts';

import { type IQueue, QueueMemory } from '../../queue/index-memory.ts';
import { uuidV4 } from '../../uid/index.ts';
import type { IKvStorage } from '../../kv-storage/index-types.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';

/** Options for {@link ActivityTrackerKvStorage}; see {@link ActivityTrackerOptions}. */
export type ActivityTrackerKvStorageOptions = ActivityTrackerOptions;

/**
 * One of this writer's segments: its key, when it stops taking entries, when everything in it
 * has aged out, and what it holds.
 */
type OwnSegment = {
    readonly key: string;
    readonly sealTs: number;
    readonly expiresTs: number;
    readonly entries: readonly StoredActivityItem[];
};

/**
 * Records a resource's request history (spend and refusals) in a key-value store, so that
 * several pacers sharing the store — across tabs, workers or restarts — pace against one
 * combined history.
 *
 * Give every pacer for the same resource the same `id` and a store they can all reach. Each
 * one then sees what all the others have recorded, and a refusal pause set by one holds back
 * all of them.
 *
 * @example
 * const store = new ChromeStorage(chrome.storage.local);
 * const pacer = new FetchPacer('gmail-api', {
 *     max_points_per_second: 250,
 *     storage: { type: 'custom', activity_tracker: (id, options) => new ActivityTrackerKvStorage(id, store, options) }
 * });
 *
 * @remarks
 * **Layout.** Each tracker instance appends only to its own segments, keys of the form
 * `fetch_pacer_activity_tracker_<id>.activities.<writer>.<expiry>`, and keeps its own history in
 * memory, so recording never reads the store and two writers can never overwrite each other's
 * entries. A segment takes the entries stamped within one retention period of its first, then
 * its writer starts another; its key names the time by which everything in it has aged out.
 * Reading lists every key under the prefix and merges the other writers' unexpired segments
 * with its own history, oldest first. Nothing about other writers is cached, so a new writer is
 * seen from its first completed write, whether or not the store announces changes. The refusal
 * pause lives in one shared key, `fetch_pacer_activity_tracker_<id>.backoff`.
 *
 * **Clearing up.** Reading never changes the store. Whenever a writer starts a segment, it
 * deletes every segment, its own or another's, whose named expiry has passed. That decision
 * rests on the key alone, never on contents that may be out of date, so a delete can only ever
 * remove entries that no longer count, even when it lands after a late write. A writer that is
 * disposed leaves its segments in place: its spend still counts until it ages out, and once
 * they expire the next writer to start a segment deletes them.
 *
 * **Cost.** Every read lists the keys under the prefix, plus one read per other unexpired
 * segment; a lone writer reads nothing but the key list. A writer lists the keys once more each
 * time it starts a segment, at most once per retention period. The store holds at most about
 * two segments for each writer active within the last two retention periods. `ChromeStorage`
 * lists keys by reading the whole storage area, so on chrome storage this suits areas that do
 * not also hold large unrelated data.
 *
 * **Limits.**
 * - An entry is invisible to others until its write completes, so two writers can each pass an
 *   admission check within the other's write latency and both send. Once both entries land the
 *   window reads over-full and both hold back, so the overshoot is at most one request per
 *   writer per such coincidence.
 * - Every tracker sharing an `id` must use the same `clear_activities_older_than_ms`. A
 *   segment's expiry follows its writer's retention, so a reader keeping history for longer
 *   stops seeing entries it still counts once their segment expires. Pacers set this
 *   themselves, so it only matters for hand-built trackers.
 * - Every writer must read the same clock: one running ahead of the others deletes their
 *   segments before everything in them has aged out.
 * - An `id` that itself contains `.activities` can have its keys listed under another `id`'s prefix.
 * - Entries written under the single shared key `fetch_pacer_activity_tracker_<id>.activities`
 *   still count, being read as one more segment, and the key is deleted once they have all aged
 *   out. Trackers that write that key must not run alongside this one on the same `id`.
 */
export class ActivityTrackerKvStorage extends BaseActivityTracker implements IActivityTracker {

    #store:IKvStorage;
    #keys:StorageKeys;
    #writerId = uuidV4();
    /** This writer's segments that may still hold entries that count, oldest first; new entries go to the last. */
    #ownSegments:readonly OwnSegment[] = [];
    // Nothing here listens for the queue's long-running warning, so its periodic check is only a timer to leak.
    #transaction:IQueue = new QueueMemory('', {testing_disable_check_timeout: true});

    /**
     * @param id The resource being paced; trackers with the same `id` on the same store share one history.
     * @param storage Where the history is kept. Defaults to a private in-memory store, which nothing else can share.
     * @param options How long history is kept (see {@link ActivityTrackerOptions}).
     */
    constructor(id: string, storage:IKvStorage = new MemoryStorage(), options?: ActivityTrackerKvStorageOptions) {
        super(options);

        this.#store = storage;
        this.#keys = storageKeysFor(id);
    }

    /**
     * Records one request's outcome in this tracker's own history.
     *
     * @param activity What happened, and when.
     * @returns Once the store has accepted the write; only then can other trackers see it.
     *
     * @remarks
     * When the entry starts a new segment, segments whose expiry has passed are also deleted
     * before this resolves. A failed delete is logged with `console.debug` and left for the next
     * segment to be started, rather than reported as a failure to record.
     */
    override async add(activity: ActivityItem): Promise<void> {
        const storedActivity: StoredActivityItem = {...activity, id: uuidV4()};

        await this.#transaction.enqueue(async () => {
            const now = Date.now();
            // A segment past its expiry holds nothing that still counts, so it need not be kept.
            const liveSegments = this.#ownSegments.filter(segment => segment.expiresTs>now);
            const open = liveSegments.at(-1);
            const fitsOpen = open!==undefined && storedActivity.timestamp<open.sealTs;
            const segment: OwnSegment = fitsOpen
                ? {...open, entries: [...open.entries, storedActivity]}
                : this.#startSegment(storedActivity);
            this.#ownSegments = [...(fitsOpen? liveSegments.slice(0, -1) : liveSegments), segment];
            await this.#store.set(segment.key, segment.entries);

            if( !fitsOpen ) {
                await this.#deleteExpiredSegments().catch((cause: unknown) => {
                    console.debug('fetch-pacer: could not clear expired history segments', cause);
                });
            }
        })
    }

    /**
     * The combined history of every tracker sharing this `id` and store, within the retention period.
     *
     * @returns A new array, oldest first. Reading never changes the store.
     */
    override async list(): Promise<StoredActivityItem[]> {
        return await this.#transaction.enqueue(async () => {
            const keys = await this.#store.getAllKeys(this.#keys.logPrefix);
            const now = Date.now();
            // This tracker's own entries are already in hand, and an expired segment holds nothing that still counts.
            const otherLiveKeys = keys.filter(key => !this.#isOwn(key) && !this.#hasExpired(key, now));
            const others = await Promise.all(otherLiveKeys.map(async key => this.discardOldActivities(asItems(await this.#store.get(key)))));
            const own = this.discardOldActivities(this.#ownSegments.flatMap(segment => segment.entries));

            // Chronological, because what happened since the last success is read across all writers.
            return [...own, ...others.flat()].sort((a, b) => a.timestamp - b.timestamp);
        })
    }

    /**
     * A segment for `first` and the entries stamped within one retention period of it. Every
     * entry it can hold has aged out one retention period after the segment stops taking
     * entries, and the key names that moment.
     */
    #startSegment(first: StoredActivityItem): OwnSegment {
        const retentionMs = this.options.clear_activities_older_than_ms;
        const sealTs = first.timestamp + retentionMs;
        const expiresTs = sealTs + retentionMs;
        return { key: segmentKey(this.#keys.logPrefix, { writerId: this.#writerId, expiresTs }), sealTs, expiresTs, entries: [first] };
    }

    /**
     * Deletes every writer's segments whose named expiry has passed. A key that names no expiry
     * (a history kept as one unsegmented log) is read instead, and deleted once all it holds has aged.
     */
    async #deleteExpiredSegments(): Promise<void> {
        const keys = await this.#store.getAllKeys(this.#keys.logPrefix);
        const now = Date.now();
        const expired = keys.filter(key => this.#hasExpired(key, now));
        const unnamed = keys.filter(key => parseSegmentKey(this.#keys.logPrefix, key)===undefined);
        const agedUnnamed = await Promise.all(unnamed.map(async key => this.discardOldActivities(asItems(await this.#store.get(key))).length===0? [key] : []));

        await Promise.allSettled([...expired, ...agedUnnamed.flat()].map(key => this.#store.remove(key)));
    }

    /** Whether `key` names one of this writer's segments. */
    #isOwn(key: string): boolean {
        return parseSegmentKey(this.#keys.logPrefix, key)?.writerId===this.#writerId;
    }

    /** Whether `key` names an expiry that has passed. A key that names none never expires by name. */
    #hasExpired(key: string, now: number): boolean {
        const expiresTs = parseSegmentKey(this.#keys.logPrefix, key)?.expiresTs;
        return expiresTs!==undefined && expiresTs<=now;
    }


    override async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        // Read and write together, so that two writers pausing the same resource at once cannot
        // both see the old value and let the shorter of their two pauses be the one that survives.
        await this.#transaction.enqueue(async () => {
            if( options?.onlyIfExceedsCurrentTs ) {
                const backOffUntilTs: number | undefined = await this.#store.get(this.#keys.backOffUntil);
                if( typeof backOffUntilTs==='number' && backOffUntilTs>ts ) {
                    return;
                }
            }

            await this.#store.set(this.#keys.backOffUntil, ts);
        })

    }

    override async getBackOffUntilTs(): Promise<number | undefined> {
        const backOffUntilTs: number | undefined = await this.#store.get(this.#keys.backOffUntil);
        if( typeof backOffUntilTs==='number' && backOffUntilTs>Date.now() ) {
            return backOffUntilTs;
        }
        return undefined;
    }
}

/** A stored segment's entries; anything else counts as empty. */
function asItems(stored: unknown): StoredActivityItem[] {
    return Array.isArray(stored)? stored : [];
}
