
import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, StoredActivityItem } from '../types.js';

import { BaseActivityTracker } from '../BaseActivityTracker.js';
import { uuidV4 } from '../../uid/uid.js';

export class ActivityTrackerMemory extends BaseActivityTracker implements IActivityTracker {
    
    
    
    

    constructor(id: string, options?: ActivityTrackerOptions) {
        super(id, options)
        
    }

    override async add(activity: ActivityItem): Promise<void> {

        this.activities.push({...activity, id: uuidV4()});
        this.activities = super.discardOldActivities(this.activities);

    }

    override async setActive(active: boolean): Promise<void> {
        this.active = active;
    }

    override async list():Promise<StoredActivityItem[]> {
        return [...this.activities];
    }


    override async dispose(): Promise<void> {
        await super.dispose();
    }
}