import type {  ActivityTrackerOptions, IActivityTracker, IPaceTracker, PaceTrackerOptions, StoredActivityItem, StoredActivityItemBackOff, StoredActivityItemReserved, StoredActivityItemSuccess } from './types.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import { convertTimestampToMillisecondsFromNow } from './utils/convertTimestampToMillisecondsFromNow.ts';
import { earliestAdmissibleTs, type QuotaWindow } from './utils/earliestAdmissibleTs.ts';

type BackOffCalculation = NonNullable<PaceTrackerOptions['back_off_calculation']>;

/** What the exponential back-off uses for each setting the caller leaves out. */
const exponentialBackOffDefaults = Object.freeze({
    initial_back_off_ms: 100,
    max_single_back_off_ms: 1000*60*5
} satisfies Required<Pick<BackOffCalculation, 'initial_back_off_ms' | 'max_single_back_off_ms'>>);

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

    async getActiveBackOffUntilTs(): Promise<number | undefined> {
        const ts = await this.#activityTracker.getBackOffUntilTs();
        if( typeof ts==='number' && ts>Date.now() ) return ts;
        return undefined;
    }

    async getActiveBackOffForMs():Promise<number | undefined> {
        return convertTimestampToMillisecondsFromNow(await this.getActiveBackOffUntilTs());
    }

    async getPauseBeforeMs(points:number): Promise<number | undefined> {
        const refusalPauseMs = (await this.getActiveBackOffForMs()) ?? 0;
        const pauseMs = Math.max(refusalPauseMs, await this.#msUntilQuotaHasRoomFor(points));
        return pauseMs>0? pauseMs : undefined;
    }

    async #msUntilQuotaHasRoomFor(points:number): Promise<number> {
        // Without a quota there is nothing to wait for, so the history need not be read at all.
        if( this.#quotaWindows.length===0 ) return 0;

        const spends = (await this.#activityTracker.list()).filter((x):x is StoredActivityItemSuccess | StoredActivityItemReserved => x.type==='success' || x.type==='reserved');
        const now = Date.now();
        return earliestAdmissibleTs(spends, points, this.#quotaWindows, now) - now;
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

        const activities = await this.#activityTracker.list();
        const backoffForMs = this.#calculateBackOffPeriodMs(activities);

        
        if( backoffForMs>0 ) {
            
            await this.#activityTracker.setBackOffUntilTs(Date.now()+backoffForMs, {onlyIfExceedsCurrentTs: true});
        }

    }



    /**
     * Return the number of milliseconds to back off for
     * 
     * @param activities 
     * @returns 
     */
    #calculateBackOffPeriodMs(activities:StoredActivityItem[]):number {

        // Only back off if recent failures have been reported
        const lastSuccessIdx = activities.findLastIndex(x => x.type==='success');
        // Only refusals: a charge made since the last success is a request sent, not one refused.
        const sequentialFailures = activities.slice(lastSuccessIdx+1).filter(x => x.type==='back_off');
        
        const backoffActivities = activities.filter((x):x is StoredActivityItemBackOff => x.type==='back_off');

        const forcedBackOffUntilAtLeastTs = backoffActivities.reduce((prev, cur) => (cur.force_back_off_until_at_least_ts??0)>prev? cur.force_back_off_until_at_least_ts! : prev, 0);
        let forcedBackOffPeriod = forcedBackOffUntilAtLeastTs-Date.now()
        if( forcedBackOffPeriod<0 ) forcedBackOffPeriod = 0; 

        
        if( forcedBackOffPeriod===0 && sequentialFailures.length===0 ) {
            return 0;
        }
        
        

        let backOffPeriod = 200; // Dumb default back off 
        let jitter = 0;
        if( this.#options.back_off_calculation?.type==='exponential' ) {

            if( sequentialFailures.length>0 ) {
                // Doubles with each refusal since the last success: e.g. 100, 200, 400, 800
                const initialMs = this.#options.back_off_calculation.initial_back_off_ms ?? exponentialBackOffDefaults.initial_back_off_ms;
                backOffPeriod = Math.pow(2, sequentialFailures.length-1) * initialMs;

                // Date it from the last failure
                backOffPeriod = backOffPeriod - (Date.now()-sequentialFailures[sequentialFailures.length-1]!.timestamp);
                if( backOffPeriod<0 ) backOffPeriod = 0;
            }
        }
        
        if( this.#options.back_off_calculation?.jitter ) {
            // Spread to either side of the calculated pause, so clients that backed off together
            // do not all return together. Spreading only later would delay every one of them.
            jitter = Math.round(backOffPeriod * 0.2 * ((Math.random() * 2) - 1));
        }




        const maxSingleBackOffMs = this.#options?.back_off_calculation?.max_single_back_off_ms ?? exponentialBackOffDefaults.max_single_back_off_ms;
        backOffPeriod = Math.min(backOffPeriod+jitter, maxSingleBackOffMs)
        if( backOffPeriod<0 ) backOffPeriod = 0;

        // Applied last, and never spread: a period the service itself named is an instruction,
        // where the periods above are this client's own estimate of when to try again.
        backOffPeriod = Math.max(backOffPeriod, forcedBackOffPeriod);

        return backOffPeriod;
    
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

