import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from '../types.js';

import { BaseActivityTracker } from '../BaseActivityTracker.js';

import { type IQueue, QueueMemory } from '../../queue/index-memory.js';
import { uuidV4 } from '../../uid/uid.js';
import type { IKvStorage } from '../../kv-storage/types.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';

/** Options for {@link ActivityTrackerKvStorage}; see {@link ActivityTrackerOptions}. */
export type ActivityTrackerKvStorageOptions = ActivityTrackerOptions;

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
 * **Layout.** Each tracker instance appends only to its own segment, a key of the form
 * `fetch_pacer_activity_tracker_<id>.activities.<random>`, and keeps that segment's contents in
 * memory, so recording never reads the store and two writers can never overwrite each other's
 * entries. Reading lists every key under the prefix and merges the other segments with its own,
 * oldest first. Nothing about other writers is cached, so a new writer is seen from its first
 * completed write, whether or not the store announces changes. The refusal pause lives in one
 * shared key, `fetch_pacer_activity_tracker_<id>.backoff`.
 *
 * **Clearing up.** Once every entry in a segment has aged out, its writer never writes to it
 * again (the next entry starts a fresh segment), so any reader may delete it without risk of
 * losing a newer entry. A writer that is disposed leaves its segment in place: its spend still
 * counts until it ages out, after which whoever reads next deletes it.
 *
 * **Cost.** Every read lists the keys under the prefix, plus one read per other live segment;
 * a lone writer reads nothing but the key list. `ChromeStorage` lists keys by reading the whole
 * storage area, so on chrome storage this suits areas that do not also hold large unrelated data.
 *
 * **Limits.**
 * - An entry is invisible to others until its write completes, so two writers can each pass an
 *   admission check within the other's write latency and both send. Once both entries land the
 *   window reads over-full and both hold back, so the overshoot is at most one request per
 *   writer per such coincidence.
 * - Every tracker sharing an `id` must use the same `clear_activities_older_than_ms`, or one may
 *   delete a segment another still counts. Pacers set this themselves, so it only matters for
 *   hand-built trackers.
 * - An `id` that itself contains `.activities` can have its keys listed under another `id`'s prefix.
 * - Entries written under the single shared key `fetch_pacer_activity_tracker_<id>.activities`
 *   still count, being read as one more segment, but trackers that write that key must not run
 *   alongside this one on the same `id`.
 */
export class ActivityTrackerKvStorage extends BaseActivityTracker implements IActivityTracker {

    #store:IKvStorage;
    #logPrefix: string;
    #ownKey?: string;
    #storageKeyBackOffUntil: string;
    // Nothing here listens for the queue's long-running warning, so its periodic check is only a timer to leak.
    #transaction:IQueue = new QueueMemory('', {testing_disable_check_timeout: true});

    /**
     * @param id The resource being paced; trackers with the same `id` on the same store share one history.
     * @param storage Where the history is kept. Defaults to a private in-memory store, which nothing else can share.
     * @param options How long history is kept (see {@link ActivityTrackerOptions}).
     */
    constructor(id: string, storage:IKvStorage = new MemoryStorage(), options?: ActivityTrackerKvStorageOptions) {
        super(id, options);

        this.#store = storage;
        this.#logPrefix = `fetch_pacer_activity_tracker_${id}.activities`;
        this.#storageKeyBackOffUntil = `fetch_pacer_activity_tracker_${id}.backoff`;
    }

    /**
     * Records one request's outcome in this tracker's own segment.
     *
     * @param activity What happened, and when.
     * @returns Once the store has accepted the write; only then can other trackers see it.
     */
    override async add(activity: ActivityItem): Promise<void> {
        const storedActivity = {...activity, id: uuidV4()};

        await this.#transaction.enqueue(async () => {
            const kept = this.discardOldActivities(this.activities);
            // Once everything in a segment has aged out, another reader may already be deleting it,
            // so writing to it again could be undone. Start a fresh segment instead.
            if( this.#ownKey===undefined || kept.length===0 ) {
                this.#ownKey = `${this.#logPrefix}.${uuidV4()}`;
            }
            this.activities = [...kept, storedActivity];
            await this.#store.set(this.#ownKey, this.activities);
        })
    }

    /**
     * The combined history of every tracker sharing this `id` and store, within the retention period.
     *
     * @returns A new array, oldest first. Stale segments found along the way are deleted.
     */
    override async list(): Promise<StoredActivityItem[]> {
        return await this.#transaction.enqueue(async () => {
            const ownKey = this.#ownKey;
            const otherKeys = (await this.#store.getAllKeys(this.#logPrefix)).filter(key => key!==ownKey);
            const otherSegments = await Promise.all(otherKeys.map(async key => {
                const stored: unknown = await this.#store.get(key);
                const live: StoredActivityItem[] = this.discardOldActivities(Array.isArray(stored)? stored : []);
                return { key, stored, live };
            }));

            // A segment with nothing left in the window is never written to again, so deleting it
            // cannot lose anything. A failed delete is left for the next reader rather than failing this one.
            const aged = otherSegments.filter(segment => segment.stored!==undefined && segment.live.length===0);
            await Promise.allSettled(aged.map(segment => this.#store.remove(segment.key)));

            // Chronological, because what happened since the last success is read across all writers.
            const others = otherSegments.flatMap(segment => segment.live);
            return [...this.discardOldActivities(this.activities), ...others].sort((a, b) => a.timestamp - b.timestamp);
        })
    }


    override async isActive(): Promise<boolean> {
        return this.active;
    }

    /**
     * Notes whether the owner is currently using the tracker. Nothing here runs in the
     * background, so this is a flag only and changes no behaviour.
     *
     * @param active Whether the owner is in use.
     */
    override async setActive(active: boolean): Promise<void> {
        this.active = active;
    }


    override async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        // Read and write together, so that two writers pausing the same resource at once cannot
        // both see the old value and let the shorter of their two pauses be the one that survives.
        await this.#transaction.enqueue(async () => {
            if( options?.onlyIfExceedsCurrentTs ) {
                const backOffUntilTs: number | undefined = await this.#store.get(this.#storageKeyBackOffUntil);
                if( typeof backOffUntilTs==='number' && backOffUntilTs>ts ) {
                    return;
                }
            }

            await this.#store.set(this.#storageKeyBackOffUntil, ts);
        })

    }

    override async getBackOffUntilTs(): Promise<number | undefined> {
        const backOffUntilTs: number | undefined = await this.#store.get(this.#storageKeyBackOffUntil);
        if( typeof backOffUntilTs==='number' && backOffUntilTs>Date.now() ) {
            return backOffUntilTs;
        }
        return undefined;
    }


    override async dispose(): Promise<void> {
        await super.dispose();
        await this.setActive(false);
    }
}
