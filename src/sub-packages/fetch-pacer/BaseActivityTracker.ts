
import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from './types.js';


export class BaseActivityTracker implements IActivityTracker {
    protected activities: StoredActivityItem[] = [];
    
    protected active: boolean = true;
    protected options:Required<ActivityTrackerOptions>;

    constructor(id: string, options?:ActivityTrackerOptions) {
        const defaultOptions:Required<ActivityTrackerOptions> = {
            clear_activities_older_than_ms: 1000*60*2
        }
        this.options = Object.assign(defaultOptions, options);
        
    }

    async add(activity: ActivityItem): Promise<void> {
        throw new Error("Method Not Implemented");
        
    }

    protected discardOldActivities<T extends ActivityItem>(activities:T[]):T[] {
        const now = Date.now();
        return activities.filter(
            item => now - item.timestamp <= this.options.clear_activities_older_than_ms
        );
    }

    async list(): Promise<StoredActivityItem[]> {
        throw new Error("Method Not Implemented");
    }


    async isActive(): Promise<boolean> {
        throw new Error("Method Not Implemented");
    }

    async setActive(active: boolean): Promise<void> {
        throw new Error("Method Not Implemented");
    }

    async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        throw new Error("Method Not Implemented");
    }

    async getBackOffUntilTs(): Promise<number | undefined> {
        throw new Error("Method Not Implemented");
    }

    async dispose(): Promise<void> {
    }
}