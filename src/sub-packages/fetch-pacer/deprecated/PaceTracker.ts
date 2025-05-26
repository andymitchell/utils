import type { ActivityTrackerOptions, IActivityTracker, StoredActivityItem } from '../types.ts';
import { ActivityTrackerMemory } from '../activity-trackers/ActivityTrackerMemory.ts';
import { ActivityTrackerBrowserLocal } from '../activity-trackers/ActivityTrackerBrowserLocal.ts';

export type CheckPaceResponse = { too_fast: boolean, pause_for: number, points_in_last_second?: number, is_back_off?: boolean };

export type PaceTrackerOptions = {
    /**
     * Used by the pacing calculation.
     * 
     * If omitted there will be no pacing. 
     */
    max_points_per_second?: number;

    /**
     * How to calculate the pacing impact of a backoff 429 from the server 
     */
    back_off_calculation?: {
        type: 'exponential',
        jitter?: boolean,
        max_single_back_off_ms?: number
    },


    /**
     * Enable a single request that exceeds the max_points_per_second to get through, if there hasn't been much recent activity.
     * 
     * Typically a burst must be paid down later. So if it allows through a big request it must wait before the next one. 
     * 
     * Note that the provider's burst allowances are often opaque. 
     * It's a good idea to just try get a request through (unless it wildly exceeds the limit), and accept that 429s will happen. 
     * 
     * @default {type: 'moving_average'}
     */
    allow_bursting?: {
        /**
         * Allows bursts within a moving average. 
         * 
         * E.g. if it allows 250 points/second, over 5 seconds it's allowed 1250 points, and in any one of those seconds it might let it through.
         * It's extremely difficult to know what the provider's calculation will be though. 
         */
        type: 'moving_average',

    } | {
        type: 'never'
    }

    /**
     * If the pace tracker has held the fetch X times,
     * it will eventually try it and hope it gets through on a burst allowance.
     * 
     * You should always do this, as it's best to at least _try_ a request against a provider
     * before giving up (instead of quota blocking it preemptively in the client).
     */
    hail_mary_after_x_holds?: number,

    verbose?: boolean,

    /**
     * Where point-usage is stored.
     * 
     * Use more durable storage to
     * - Track pace in volatile environments (like a service worker)
     * - Track pace across multiple clients 
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

export default class PaceTracker {
    
    #activityTracker:IActivityTracker;
    #options:PaceTrackerOptions;


    constructor(id: string, options?:PaceTrackerOptions) {
        
        this.#options = {
            allow_bursting: {type: 'moving_average'},
            hail_mary_after_x_holds: 10,
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
            clear_activities_older_than_ms: 1000*60*1
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



    /**
     * Check the pace of recorded points against the maximum points/second. 
     * 
     * Optionally provide points to anticipate if they'll exceed the pace. 
     * 
     * @param points Would the pace be too_fast if these points are applied? Use to pre-empt if a fetch will trigger a 429. 
     * @param attempt Used for hail mary's, and burst exceptions, to consider letting a request through (at the risk of a 429). Expected to start from 1.
     * @param denyBurstGrace If true, the burst bypass will be denied. Useful after a 429 to calculate the true back off period.
     * @returns 
     */
    async checkPace(points: number = 0, attempt = 0, denyBurstGrace = false): Promise<CheckPaceResponse> {
        const maxPointsPerSecond = this.#options?.max_points_per_second;
        const allowBursting = this.#options?.allow_bursting;
        
        

        const activities = await this.#activityTracker.list();

        // Check for any hard back off
        let backoffResponse:CheckPaceResponse | undefined;
        if( this.#options.back_off_calculation ) {

            const backOffPeriod = this.#calculateBackOffPeriod(activities);
            if( backOffPeriod>0 ) {
                backoffResponse = {too_fast: true, pause_for: backOffPeriod, is_back_off: true};
            }
        }

        

        // Now check the rest
        let pointsResponse:CheckPaceResponse | undefined;
        if( maxPointsPerSecond ) {
            const recent = this.checkPaceInPeriod(1, points, activities);
            const rolling = this.checkPaceInPeriod(15, points, activities);

            let too_fast = recent.too_fast || rolling.too_fast;


            // check if will allow a burst, as otherwise any call larger than the hard max will be permanently denied. 
            // remember **be generous**... provider quota's are often opaque, and the last thing we want to do is block a request that might have succeeded.
            // Just accept you might get more 429s this way. 
            if( too_fast && allowBursting && points > maxPointsPerSecond ) {
                if( allowBursting?.type==='moving_average' ) {
                    if( attempt===0 && !denyBurstGrace ) {
                        // On the first attempt, be generous and risk the 429, just to see if the provider will let it happen. (On subsequent attempts it will pause to give it breathing room.)
                        too_fast = false;
                        if( this.#options?.verbose ) console.log("FetchPacer is permitting the API units, as 'bursts' are allowed for excessively large requests. This is a first request, so it's risking a 429 before waiting.");
                    } else if ( recent.pointsInPeriodRaw===0 && (!rolling.too_fast || rolling.pointsInPeriodRaw===0)) {
                        too_fast = false;
                        if( this.#options?.verbose ) console.log("FetchPacer is permitting the API units, as 'bursts' are allowed for excessively large requests.");
                    }
                }
            }

            // check if it's been held too many times, and then hail mary it (if it's going to fail, at least give it a chance with the api's burst allowance)
            if( this.#options.hail_mary_after_x_holds ) {
                if (attempt >= this.#options.hail_mary_after_x_holds) {
                    too_fast = false;
                    console.warn("FetchPacer is permitting the API units, as it's been held too many times. Hope it gets through on the burst.");
                }
            }
            

            let pause_for: number = 0;
            if (too_fast) {
                // Calculate time it'll take (#periods) before it drops below the points amassed 
                const recentPeriodsToClear = recent.pointsInPeriod>recent.maxPointsInPeriod? Math.floor(recent.pointsInPeriod / recent.maxPointsInPeriod) : 0;
                const rollingPeriodsToClear = rolling.pointsInPeriod>rolling.maxPointsInPeriod? Math.floor(rolling.pointsInPeriod / rolling.maxPointsInPeriod) : 0;
                const recentMsToClear = recentPeriodsToClear * recent.period;
                const rollingMsToClear = rollingPeriodsToClear * rolling.period;

                

                pause_for = recentMsToClear > rollingMsToClear ? recentMsToClear : rollingMsToClear;
                if (pause_for < 0) pause_for = 0;
                if( this.#options?.verbose ) console.log("FetchPacer detected running tooFast, will sleep.", {attempt, recent, rolling, points, maxPointsPerSecond, pause_for, recentMsToClear, rollingMsToClear });
            }
            pointsResponse = { too_fast, pause_for, points_in_last_second: recent.pointsInPeriod };
        }

        // Return the greatest pause request 

            
        if( backoffResponse || pointsResponse ) {
            if( backoffResponse && pointsResponse ) {
                return backoffResponse.pause_for > pointsResponse.pause_for? backoffResponse : pointsResponse;
            } else if( backoffResponse ) {
                return backoffResponse;
            } else if( pointsResponse ) {
                return pointsResponse;
            } else {
                throw new Error("noop");
            }
        } else {
            return {too_fast: false, pause_for: 0};
        }
    }

    private checkPaceInPeriod(seconds = 1, points: number, activities:StoredActivityItem[]): { too_fast: boolean, pointsInPeriod: number, maxPointsInPeriod: number, period: number, pointsInPeriodRaw: number } {
        const maxPointsPerSecond = this.#options?.max_points_per_second;
        if( !maxPointsPerSecond ) return { too_fast: false, pointsInPeriod: 0, pointsInPeriodRaw: 0, period: 0, maxPointsInPeriod: 0 };

        


        const period = 1000 * seconds;
        const after = Date.now() - period;
        activities = activities.filter(x => x.timestamp > after);

        const pointsInPeriodRaw = activities.filter(x => x.type==='success').reduce((previousValue, currentValue) => previousValue + currentValue.points, 0);
        const pointsInPeriod = pointsInPeriodRaw + points;


        const maxPointsInPeriod = (maxPointsPerSecond * seconds);
        const too_fast = pointsInPeriod > maxPointsInPeriod;
        return { too_fast, pointsInPeriod, maxPointsInPeriod, period, pointsInPeriodRaw };
    }


    async logPoints(points:number):Promise<void> {
        await this.#activityTracker.add({
            type: 'success',
            timestamp: Date.now(),
            points
        })
    }

    #calculateBackOffPeriod(activities:StoredActivityItem[]):number {

        // Only back off if recent failures have been reported
        const lastSuccessIdx = activities.findLastIndex(x => x.type==='success');
        const sequentialFailures = activities.slice(lastSuccessIdx+1);
        
        const forcedBackOffUntilTs = activities.filter(x => x.type==='back_off').reduce((prev, cur) => (cur.force_back_off_until_at_least_ts??0)>prev? cur.force_back_off_until_at_least_ts! : prev, 0);
        let forcedBackOffPeriod = forcedBackOffUntilTs-Date.now()
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

        

        backOffPeriod = Math.min(backOffPeriod+jitter, this.#options?.back_off_calculation?.max_single_back_off_ms!-jitter)
        backOffPeriod = Math.max(backOffPeriod, forcedBackOffPeriod);

        return backOffPeriod;
    
    }

    async logBackOffResponse(forceBackOffPeriod?:number):Promise<void> {

        await this.#activityTracker.add({
            type: 'back_off',
            timestamp: Date.now(),
            force_back_off_until_at_least_ts: forceBackOffPeriod? Date.now()+forceBackOffPeriod : undefined
        });
    }

    async setActive(active:boolean):Promise<void> {
        await this.#activityTracker.setActive(active);
    }


    /**
     * Can this points request *ever* be handled, or does it exceed quota (including burst)?
     * 
     * Use it to know you'd have to break up your fetch request, as it'll never succeed. 
     * 
     * **This is guidance only**. It's extremely hard to know what a provider will allow.
     * For example you might use this to _choose_ to break up a batch request into smaller
     * parts; but don't let it stop you ever trying if you can't reduce it. The provider may well
     * let it through. 
     * 
     * @param points The points that you want to consume
     */
    async possiblyExceedsMaxThroughput(points:number):Promise<boolean> {
        const maxPointsPerSecond = this.#options.max_points_per_second;
        if( typeof maxPointsPerSecond!=='number' ) return true;
        
        if( this.#options.allow_bursting?.type==='moving_average' ) {
            // For bursting, assume a 10x allowance over the max (this is roughly in line with what Gmail might allow. Guesstimate from their advice to not send a batch of more than 50, and their quota for send messages is 100pts, so that would be 5000pts max, but then be cautious and halve that).

            // TODO If FetchPacer returns `cannot_recover` for a response, notify what that point was, and set it as a new limit for this service (instead of maxPointsPerSecond*10)
            // Use the activity tracker to store it. FetchPacer can call setRealtimeMaxPointsLimit.
            return points < (maxPointsPerSecond*10);
        } else {
            return points < maxPointsPerSecond;
        }
    }

    async dispose():Promise<void> {
        await this.#activityTracker.dispose();
    }

}
