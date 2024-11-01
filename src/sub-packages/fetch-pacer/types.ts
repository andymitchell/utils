type ActivityItemSuccess = {
    type: 'success';
    timestamp: number;
    points: number;
}
type ActivityItemBackOff = {
    type: 'back_off',
    timestamp: number;
    force_back_off_until_ts?: number
}
export type ActivityItem =  ActivityItemSuccess | ActivityItemBackOff;

export type StoredActivityItem = ActivityItem & {
    id: string;
}

export type Fetch = typeof fetch;

export type FetchURL = RequestInfo | URL;
export type FetchOptions = RequestInit;

export type PaceTrackerOptions = {
    max_points_per_second?: number;
    /**
     * How to calculate the pacing impact of a backoff 429 from the server 
     */
    back_off_calculation?: {
        type: 'exponential',
        jitter?: boolean,
        max_single_back_off_ms?: number
    },
    hail_mary_after_many_failures?: boolean,
    verbose?: boolean,

    storage?: {
        type: 'memory'
    } | {
        type: 'browser-local'
    } | {
        type: 'custom',
        activity_tracker: (id: string, options?: ActivityTrackerOptions) => IActivityTracker
    }
}

export interface BackOffResponse extends Response {
    status: 429;
    statusText: "Too Many Requests";
    back_off_for_ms?: number;
}

export type FetchPacerOptions = PaceTrackerOptions & {
    
    custom_fetch_function?: Fetch,
    
    minimum_time_between_fetch?: number,

    /**
     * Define strategy for requests that are hitting the rate limit 
     */
    mode: {
        /**
         * Preemptive rate limiting mode. Checks current pace to avoid server strain by simulating a 429 response before a fetch attempt.
         * @type {'429_preemptively'}
         */
        type: '429_preemptively'
    } | {
        /**
         * Recovery mode with silent retries, behaving like a regular fetch to the caller.
         * @type {'attempt_recovery'}
         */
        type: 'attempt_recovery',
        /**
         * The period it will attempt to recover for before finally giving up 
         */
        timeout_ms?: number
    }
    
}

export type CheckPaceResponse = { too_fast: boolean, pause_for: number, is_back_off?: boolean, points_in_last_second?: number };

export interface IActivityTracker {
    /**
     * Adds an activity item.
     * @param activity 
     */
    add(activity: ActivityItem): Promise<void>;

    /**
     * Activates or deactivates polling/processing.
     * @param active 
     */
    setActive(active: boolean): Promise<void>;


    list():Promise<StoredActivityItem[]>

    /**
     * Disposes resources and removes event listeners.
     */
    dispose(): Promise<void>;
}

export type ActivityTrackerOptions = {
    clear_activities_older_than_ms?: number
}