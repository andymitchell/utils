import { ActivityTrackerOptions, CheckPaceResponse, IActivityTracker, PaceTrackerOptions, StoredActivityItem } from './types';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal';



export default class PaceTracker {
    
    #activityTracker:IActivityTracker;
    #options:PaceTrackerOptions;

    #paceChecks: Record<string, number>;

    constructor(id: string, options?:PaceTrackerOptions) {
        
        this.#options = {
            hail_mary_after_many_failures: true,
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

        
        this.#paceChecks = {};
    }



    /**
     * Check the pace of recorded points against the maximum points/second. 
     * 
     * Optionally provide points to anticipate if they'll exceed the pace. 
     * 
     * @param points Would the pace be too_fast if these points are applied? Use to pre-empt if a fetch will trigger a 429. 
     * @param trackingID Used for hail mary's. Probably the queue job's id; so if it's been blocked too many times it'll risk running it. 
     * @returns 
     */
    async checkPace(points: number = 0, trackingID?: string): Promise<CheckPaceResponse> {
        const maxPointsPerSecond = this.#options?.max_points_per_second;
        

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
            if (too_fast && points > maxPointsPerSecond && recent.pointsInPeriodRaw === 0 && !rolling.too_fast) {
                too_fast = false;
                if( this.#options?.verbose ) console.log("FetchPacer is permitting the API units, as 'bursts' are allowed for excessively large requests.");
            }

            // check if it's been held too many times, and then hail mary it (if it's going to fail, at least give it a chance with the api's burst allowance)
            if (trackingID) {
                if( this.#options.hail_mary_after_many_failures ) {
                    if (!this.#paceChecks[trackingID]) this.#paceChecks[trackingID] = 0;
                    if (this.#paceChecks[trackingID]++ >= 10) {
                        too_fast = false;
                        console.warn("FetchPacer is permitting the API units, as it's been held too many times. Hope it gets through on the burst.");
                    }
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
                if( this.#options?.verbose ) console.log("FetchPacer detected running tooFast, will sleep.", { trackingID, recent, rolling, points, maxPointsPerSecond, pause_for, recentMsToClear, rollingMsToClear });
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
        
        const forcedBackOffUntilTs = activities.filter(x => x.type==='back_off').reduce((prev, cur) => (cur.force_back_off_until_ts??0)>prev? cur.force_back_off_until_ts! : prev, 0);
        let forcedBackOffPeriod = forcedBackOffUntilTs-Date.now()
        if( forcedBackOffPeriod<0 ) forcedBackOffPeriod = 0; 

        if( forcedBackOffPeriod===0 && sequentialFailures.length===0 ) {
            return 0;
        }
        

        let backOffPeriod = 200; // Dumb default back off 
        let jitter = 0;
        if( this.#options.back_off_calculation?.type==='exponential' ) {

            if( sequentialFailures.length>0 ) {
                console.log({sequentialFailures});
                
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
            force_back_off_until_ts: forceBackOffPeriod? Date.now()+forceBackOffPeriod : undefined
        });
    }

    async setActive(active:boolean):Promise<void> {
        await this.#activityTracker.setActive(active);
    }

    async dispose():Promise<void> {
        await this.#activityTracker.dispose();
    }

}
