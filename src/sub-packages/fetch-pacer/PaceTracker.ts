import type { ActivityTrackerOptions, IActivityTracker, StoredActivityItem, StoredActivityItemBackOff, StoredActivityItemReserved, StoredActivityItemSuccess } from './activity-tracker-types.ts';
import type { IPaceTracker, PaceTrackerOptions, QuotaWindow } from './pace-tracker-types.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import { earliestAdmissibleTs } from './utils/earliestAdmissibleTs.ts';

type BackOffCalculation = NonNullable<PaceTrackerOptions['back_off_calculation']>;

/** What the exponential back-off uses for each setting the caller leaves out. */
const exponentialBackOffDefaults = Object.freeze({
    initial_back_off_ms: 100,
    max_single_back_off_ms: 1000*60*5
} satisfies Required<Pick<BackOffCalculation, 'initial_back_off_ms' | 'max_single_back_off_ms'>>);

/** The pause, in milliseconds, that a refusal earns when no `back_off_calculation` is set. */
const FIXED_BACK_OFF_MS = 200;

/**
 * Decides how long to hold a request back, so that spending stays within a quota and the
 * service's refusals are respected.
 *
 * Two things can hold a request back:
 * 1. **The quota.** With `max_points_per_second` set, each request's cost counts against a
 *    sliding one-second window from the moment it is sent (`reservePoints`). Before a request
 *    is sent, `getPauseBeforeMs` works out when enough earlier spend will have left the window
 *    for it to fit, and waits no longer than that. A request larger than the whole quota is let
 *    through once the window is empty, so it runs once rather than never.
 * 2. **A refusal.** When the service turns a request away for going too fast, `logBackOff`
 *    sets a pause that holds every request back. It can grow exponentially over consecutive
 *    refusals (`back_off_calculation`), is never shorter than a wait the service named, only
 *    ever lengthens while in force, and is capped by `max_single_back_off_ms`.
 *
 * Spending never sets the refusal pause, so a pacer sharing this history that has not been
 * refused is never told it is backing off.
 *
 * History is kept by an {@link IActivityTracker}: in memory, in browser extension storage, or
 * in a custom store. Trackers with the same `id` on the same durable store share one history,
 * so several pacers (e.g. in different tabs) spend from one quota.
 *
 * @example
 * const tracker = new PaceTracker('mail-api:user-1', { max_points_per_second: 250 });
 * const waitMs = await tracker.getPauseBeforeMs(5);
 * if( waitMs ) await sleep(waitMs);
 * const charged = tracker.reservePoints(5);
 * const response = await fetch(url);
 * await charged;
 * if( response.status===429 ) await tracker.logBackOff();
 * else if( response.ok ) await tracker.logSuccess(0);
 */
export default class PaceTracker implements IPaceTracker {
    
    #activityTracker:IActivityTracker;
    #options:PaceTrackerOptions;
    #quotaWindows:readonly QuotaWindow[];


    constructor(id: string, options?:PaceTrackerOptions) {

        this.#options = {
            storage: {
                type: 'memory'
            },
            ...options
        }
        const maxPointsPerSecond = this.#options.max_points_per_second;
        this.#quotaWindows = maxPointsPerSecond? [{ points: maxPointsPerSecond, per_ms: 1000 }] : [];
        if( this.#options.back_off_calculation ) {
            this.#options.back_off_calculation = {
                ...exponentialBackOffDefaults,
                ...this.#options.back_off_calculation
            }
        }

        const activityTrackerOptions:ActivityTrackerOptions = {
            clear_activities_older_than_ms: 1000*60*5
        }
        switch(this.#options.storage!.type) {
            case 'memory': 
                this.#activityTracker = new ActivityTrackerMemory(id, activityTrackerOptions);
                break;
            case 'browser-local': 
                this.#activityTracker = new ActivityTrackerBrowserLocal(id, activityTrackerOptions);
                break;
            case 'custom': 
                this.#activityTracker = this.#options.storage!.activity_tracker(id, activityTrackerOptions);
                break;
            default: 
                throw new Error("Unknown activity tracker");
        }

        
    }

    async getRefusalPauseUntilTs(): Promise<number | undefined> {
        const ts = await this.#activityTracker.getBackOffUntilTs();
        if( typeof ts==='number' && ts>Date.now() ) return ts;
        return undefined;
    }

    async getPauseBeforeMs(points:number): Promise<number | undefined> {
        // Each part is read at a different moment, and the store may be slow to answer. A deadline
        // stays true however long that takes, so only the final one is turned into a wait.
        const refusedUntilTs = (await this.getRefusalPauseUntilTs()) ?? 0;
        const quotaFitTs = await this.#earliestQuotaFitTs(points);
        const pauseMs = Math.max(refusedUntilTs, quotaFitTs) - Date.now();
        return pauseMs>0? pauseMs : undefined;
    }

    /** When the quota next has room for `points`; 0 when no quota is set. */
    async #earliestQuotaFitTs(points:number): Promise<number> {
        // Without a quota there is nothing to wait for, so the history need not be read at all.
        if( this.#quotaWindows.length===0 ) return 0;

        const spends = (await this.#activityTracker.list()).filter((x):x is StoredActivityItemSuccess | StoredActivityItemReserved => x.type==='success' || x.type==='reserved');
        return earliestAdmissibleTs(spends, points, this.#quotaWindows, Date.now());
    }

    async reservePoints(points:number): Promise<void> {
        // Read before anything is awaited: the charge dates from the send, not from when it is stored.
        const timestamp = Date.now();
        await this.#activityTracker.add({
            type: 'reserved',
            timestamp,
            points
        })
    }

    async logSuccess(points:number): Promise<void> {
        // Awaited so that a caller which sends its next request the moment this resolves is
        // paced against the spend just recorded, rather than racing the write.
        await this.#activityTracker.add({
            type: 'success',
            timestamp: Date.now(),
            points
        })
    }

    async logBackOff(minimumBackOffPeriodMs?:number): Promise<void> {
        await this.#activityTracker.add({
            type: 'back_off',
            timestamp: Date.now(),
            force_back_off_until_at_least_ts: minimumBackOffPeriodMs? Date.now()+minimumBackOffPeriodMs : undefined
        });

        const pauseMs = this.#calculateBackOffPeriodMs(await this.#activityTracker.list());
        if( pauseMs>0 ) {
            await this.#activityTracker.setBackOffUntilTs(Date.now()+pauseMs, {onlyIfExceedsCurrentTs: true});
        }
    }

    /**
     * Works out how long every request should pause after a refusal.
     *
     * The pause is the pacer's own estimate. With an exponential `back_off_calculation` it starts
     * at `initial_back_off_ms`, doubles with each refusal in the current run (counted across every
     * pacer sharing the history), and is dated from the latest refusal. Without one it is
     * {@link FIXED_BACK_OFF_MS}. Jitter, when asked for, varies the estimate by up to a fifth
     * either way, and `max_single_back_off_ms` caps it.
     *
     * The run is every refusal since the last success listed before the latest refusal, so the
     * latest refusal always counts.
     *
     * A wait the service named is applied last, as a floor that is neither capped nor varied: it
     * is an instruction, where the estimate is only a guess at when to try again.
     *
     * @param activities The shared history, oldest first.
     * @returns The pause in milliseconds from now, never negative; 0 when the history holds no
     * refusal.
     *
     * @remarks
     * A success listed after the latest refusal does not end the run, even one that another pacer
     * recorded in the same instant. Each answer is recorded when it comes back, so such a success
     * was most likely let in before the limit was hit, and does not show that the service has
     * eased. Where it truly came first, the pause is one doubling longer than it needed to be.
     */
    #calculateBackOffPeriodMs(activities:StoredActivityItem[]):number {
        const latestRefusalIdx = activities.findLastIndex(x => x.type==='back_off');
        // Undefined when the history holds no refusal.
        const latestRefusal = activities[latestRefusalIdx];
        if( latestRefusal===undefined ) return 0;

        // Only a success listed before the latest refusal ends the run: one recorded with it, or
        // since, was most likely let in before the limit was hit.
        const lastSuccessIdx = activities.findLastIndex((x, i) => i<latestRefusalIdx && x.type==='success');
        // Only refusals: a charge made since the last success is a request sent, not one refused.
        const refusalsInRun = activities.slice(lastSuccessIdx+1, latestRefusalIdx+1).filter(x => x.type==='back_off').length;

        // Every named wait counts, not only those in the run: it holds until it passes.
        const namedWaitUntilTs = activities
            .filter((x):x is StoredActivityItemBackOff => x.type==='back_off')
            .reduce((latest, x) => Math.max(latest, x.force_back_off_until_at_least_ts ?? 0), 0);
        const namedWaitMs = Math.max(namedWaitUntilTs-Date.now(), 0);

        const calculation = this.#options.back_off_calculation;
        let estimateMs = FIXED_BACK_OFF_MS;
        if( calculation?.type==='exponential' ) {
            // Doubles with each refusal in the run: e.g. 100, 200, 400, 800
            const initialMs = calculation.initial_back_off_ms ?? exponentialBackOffDefaults.initial_back_off_ms;
            const sinceLatestRefusalMs = Date.now()-latestRefusal.timestamp;
            estimateMs = Math.max(Math.pow(2, refusalsInRun-1) * initialMs - sinceLatestRefusalMs, 0);
        }

        // Spread to either side of the calculated pause, so clients that backed off together
        // do not all return together. Spreading only later would delay every one of them.
        const jitterMs = calculation?.jitter? Math.round(estimateMs * 0.2 * ((Math.random() * 2) - 1)) : 0;

        const maxSingleBackOffMs = calculation?.max_single_back_off_ms ?? exponentialBackOffDefaults.max_single_back_off_ms;
        estimateMs = Math.max(Math.min(estimateMs+jitterMs, maxSingleBackOffMs), 0);

        return Math.max(estimateMs, namedWaitMs);
    }

    async isActive():Promise<boolean> {
        return await this.#activityTracker.isActive();
    }
    async setActive(active:boolean):Promise<void> {
        await this.#activityTracker.setActive(active);
    }


    async dispose():Promise<void> {
        await this.#activityTracker.dispose();
    }

}

