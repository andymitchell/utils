/// <reference types="chrome" />


import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, SetBackOffUntilTsOptions, StoredActivityItem } from '../types.js';

import { BaseActivityTracker } from '../BaseActivityTracker.js';

import { type IQueue, QueueMemory } from '../../queue/index-memory.js';
import { uuidV4 } from '../../uid/uid.js';
import type { IKvStorage } from '../../kv-storage/types.ts';
import { ChromeStorage } from '../../kv-storage/adapters/ChromeStorage.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';

export type ActivityTrackerKvStorageOptions = ActivityTrackerOptions & {
    failsafe_active_sync_poll_ms?: number
}

export class ActivityTrackerKvStorage extends BaseActivityTracker implements IActivityTracker {
    
    
    
    #store:IKvStorage;
    #failSafeSync:{every_ms:number, timer?: NodeJS.Timeout | number} = {every_ms: -1}
    #storageKeyActivities: string;
    #storageKeyBackOffUntil: string;
    #transaction:IQueue = new QueueMemory('');

    constructor(id: string, storage:IKvStorage = new MemoryStorage(), options?: ActivityTrackerKvStorageOptions) {
        super(id, options);

        this.#store = storage;
        
        this.#failSafeSync.every_ms = options?.failsafe_active_sync_poll_ms ?? (1000*20);
        this.#storageKeyActivities = `fetch_pacer_activity_tracker_${id}.activities`;
        this.#storageKeyBackOffUntil = `fetch_pacer_activity_tracker_${id}.backoff`;

        this.#loadActivitiesFromStorage();

        this.#store.events.on('CHANGE', (event) => {
            if( event.key===this.#storageKeyActivities ) {
                this.activities = event.newValue;
            }
        })
    }

    override async add(activity: ActivityItem): Promise<void> {
        const storedActivity = {...activity, id: uuidV4()};

        await this.#transaction.enqueue(async () => {
            await this.#loadActivitiesFromStorage();
            const newActivities = this.discardOldActivities([...this.activities, storedActivity]);
            await this.#store.set(this.#storageKeyActivities, newActivities);
            this.activities = newActivities;
        })
        
    }

    override async list(): Promise<StoredActivityItem[]> {
        return await this.#transaction.enqueue(async () => {
            return this.activities;
        })
    }


    override async isActive(): Promise<boolean> {
        return this.active;
    }
    
    override async setActive(active: boolean): Promise<void> {
        if (this.active === active) return;

        this.active = active;
        
        if (this.active) {
            await this.#loadActivitiesFromStorage();
            this.#failSafeSync.timer = setInterval(() => this.#loadActivitiesFromStorage(), this.#failSafeSync.every_ms);
        } else {
            if( this.#failSafeSync.timer ) { 
                clearInterval(this.#failSafeSync.timer);
                this.#failSafeSync.timer = undefined;
            }
        }
    }


    override async setBackOffUntilTs(ts: number, options?: SetBackOffUntilTsOptions): Promise<void> {
        if( options?.onlyIfExceedsCurrentTs ) {
            const backOffUntilTs: number | undefined = await this.#store.get(this.#storageKeyBackOffUntil);
            if( typeof backOffUntilTs==='number' && backOffUntilTs>ts ) {
                return;
            }
        }

        await this.#store.set(this.#storageKeyBackOffUntil, ts);

    }

    override async getBackOffUntilTs(): Promise<number | undefined> {
        const backOffUntilTs: number | undefined = await this.#store.get(this.#storageKeyBackOffUntil);
        if( typeof backOffUntilTs==='number' && backOffUntilTs>Date.now() ) {
            return backOffUntilTs;
        }
        return undefined;
    }

    async #loadActivitiesFromStorage(): Promise<void> {
        const storedActivities: StoredActivityItem[] = await this.#store.get(this.#storageKeyActivities) ?? [];
        this.activities = storedActivities;
    }


    override async dispose(): Promise<void> {
        await super.dispose();
        await this.setActive(false);

        
    }
}