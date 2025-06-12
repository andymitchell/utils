import { MemoryStorage } from '../../kv-storage/index.ts';
import type { IActivityTracker } from '../types.js';

import { ActivityTrackerKvStorage, type ActivityTrackerKvStorageOptions } from './ActivityTrackerKvStorage.ts';



export class ActivityTrackerMemory extends ActivityTrackerKvStorage implements IActivityTracker {
    
    
    constructor(id: string, options?: ActivityTrackerKvStorageOptions) {
        const kvStorage = new MemoryStorage();
        super(id, kvStorage, options);

        
    }

}

/*
import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from '../types.js';

import { BaseActivityTracker } from '../BaseActivityTracker.js';
import { uuidV4 } from '../../uid/uid.js';


export class ActivityTrackerMemory extends BaseActivityTracker implements IActivityTracker {
    
    
    #backOffUntilTs: number | undefined;
    

    constructor(id: string, options?: ActivityTrackerOptions) {
        super(id, options)
        
    }

    override async add(activity: ActivityItem): Promise<void> {

        this.activities.push({...activity, id: uuidV4()});
        this.activities = super.discardOldActivities(this.activities);

    }

    override async isActive(): Promise<boolean> {
        return this.active;
    }
    override async setActive(active: boolean): Promise<void> {
        this.active = active;
    }

    override async list():Promise<StoredActivityItem[]> {
        return structuredClone(this.activities);
    }


    override async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        if( options?.onlyIfExceedsCurrentTs && this.#backOffUntilTs ) {
            if( ts>this.#backOffUntilTs ) {
                this.#backOffUntilTs = ts;
            }
        } else {
            this.#backOffUntilTs = ts;
        }
    }

    override async getBackOffUntilTs(): Promise<number | undefined> {
        return this.#backOffUntilTs;
    }

    override async dispose(): Promise<void> {
        await super.dispose();
    }
}
*/