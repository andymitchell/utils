import type { ActivityTrackerOptions, IActivityTracker, IPaceTracker, PaceTrackerOptions, StoredActivityItem } from './types.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import { convertTimestampToMillisecondsFromNow } from './utils/convertTimestampToMillisecondsFromNow.ts';


/**
 * Helps manage the rate of fetch requests to
 * respect usage quotas and handle server-indicated (429) rate limits.
 *
 * It works by:
 * 1.  **Proactive Pacing (Quota Management)**: If `max_points_per_second` is configured,
 *     it monitors "points" consumed by successful operations. After each success,
 *     it sets a cool-off period to allow the quota usage to return to 0, advising a pause for
 *     future operations until the projected rate is acceptable.
 *
 * 2.  **Reactive Backoff (429 Handling)**: When a server signals a rate limit (a
 *     HTTP 429 error), this event is logged via `logBackOff()`. It then
 *     calculates a back-off duration, potentially using an exponential strategy for
 *     consecutive failures. 
 *
 * The cool off period (retrievable via `getActiveBackOffUntilTs()`) represents the
 * earliest time the next operation should ideally be attempted. This timestamp is
 * designed to only ever increase or stay the same; successful operations do not
 * reduce an active cool-off or back-off period. A configurable cap
 * (`max_single_back_off_ms`) prevents runaway back-off calculations from causing
 * excessively long pauses.
 *
 * Activity history (successes and backoffs) is managed by an `IActivityTracker`
 * implementation, allowing for different storage backends like in-memory,
 * browser localStorage, or a custom solution.
 * 
 * Designed to be used before a fetch request, by calling `getActiveBackOffUntilTs`
 * 
 * ===
 * 
 * **Architecture Note**:
 * Cool-off is applied *after* a request runs, not before.
 * 
 * This design has two advantages:
 * 1. It simplifies the logic, especially when handling burst allowances.
 * 2. It ensures even large requests (that exceed the per-second quota) are allowed to run once,
 *    instead of being blocked forever by a pre-check.
 * 
 * In short, the system reacts to quota overuse *after* the fact (by pausing future requests),
 * rather than trying to predict whether a request should be allowed in advance.
 */
export default class PaceTracker implements IPaceTracker {
    
    #activityTracker:IActivityTracker;
    #options:PaceTrackerOptions;


    constructor(id: string, options?:PaceTrackerOptions) {
        
        this.#options = {
            storage: {
                type: 'memory'
            },
            ...options
        }
        if( this.#options.back_off_calculation ) {
            this.#options.back_off_calculation = {
                max_single_back_off_ms: 1000*60*5,
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

    async logSuccess(points:number): Promise<void> {
        await this.#activityTracker.add({
            type: 'success',
            timestamp: Date.now(),
            points
        })

        
        const maxPointsPerSecond = this.#options?.max_points_per_second;
        if( maxPointsPerSecond ) {
            
            const activities = await this.#activityTracker.list();

            const calculateMsToDropQuotaToZero = (windowSeconds:number) => {
                const pace = this.checkPaceInPeriod(windowSeconds, activities);
                const pcQuotaUsed = pace.pointsInPeriod>0 && pace.maxPointsInPeriod>0? pace.pointsInPeriod / pace.maxPointsInPeriod : 0;
                const msToClear = pcQuotaUsed * pace.period;
                return Math.round(msToClear);
            }

            // Test different moving averages, and use the longest
            const msToClearForVariousPeriods:number[] = [];
            for( let windowSeconds = 1; windowSeconds <= 30; windowSeconds++ ) {
                msToClearForVariousPeriods.push(
                    calculateMsToDropQuotaToZero(windowSeconds)
                )
            }

            const maxPauseMs = msToClearForVariousPeriods.reduce((a, b) => Math.max(a, b), -Infinity);

            if( maxPauseMs>0 ) {
                this.#activityTracker.setBackOffUntilTs(Date.now()+maxPauseMs, {onlyIfExceedsCurrentTs: true});
            }

            
        }

        

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

    

    private checkPaceInPeriod(seconds = 1, activities:StoredActivityItem[]): { too_fast: boolean, pointsInPeriod: number, maxPointsInPeriod: number, period: number } {
        const maxPointsPerSecond = this.#options?.max_points_per_second;
        if( !maxPointsPerSecond ) return { too_fast: false, pointsInPeriod: 0,  period: 0, maxPointsInPeriod: 0 };

        const period = 1000 * seconds;
        const after = Date.now() - period;
        activities = activities.filter(x => x.timestamp > after);

        const pointsInPeriod = activities.filter(x => x.type==='success').reduce((previousValue, currentValue) => previousValue + currentValue.points, 0);


        const maxPointsInPeriod = (maxPointsPerSecond * seconds);
        const too_fast = pointsInPeriod > maxPointsInPeriod;
        return { too_fast, pointsInPeriod, maxPointsInPeriod, period };
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
        const sequentialFailures = activities.slice(lastSuccessIdx+1);
        
        const backoffActivities = activities.filter(x => x.type==='back_off');

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
                //console.log({sequentialFailures});
                
                // TODO This could be much more intelligently done by knowing how well spaced each one is. I.e. if trying for a while, then grow it. Or based on the previous back off? Actually shouldn't be necessary if fetch is correctly utilising the checkPace.pause_for period.
                backOffPeriod = (Math.pow(2, sequentialFailures.length-1)) * 100; // 100, 200, 400, 800;

                // Date it from the last failure
                backOffPeriod = backOffPeriod - (Date.now()-sequentialFailures[sequentialFailures.length-1]!.timestamp);
                if( backOffPeriod<0 ) backOffPeriod = 0;
            }
        }
        
        if( this.#options.back_off_calculation?.jitter ) {
            jitter = Math.floor(backOffPeriod * 0.4 * Math.random());
        }


        

        let maxSingleBackOffMs = (this.#options?.back_off_calculation?.max_single_back_off_ms ?? 1000*60*5)-jitter;
        if( maxSingleBackOffMs<0 ) maxSingleBackOffMs = 0;
        backOffPeriod = Math.min(backOffPeriod+jitter, maxSingleBackOffMs)
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

