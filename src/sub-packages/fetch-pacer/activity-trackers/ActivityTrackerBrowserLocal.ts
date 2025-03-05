/// <reference types="chrome" />


import type { ActivityItem, ActivityTrackerOptions, IActivityTracker, StoredActivityItem } from '../types.js';

import { BaseActivityTracker } from '../BaseActivityTracker.js';
import { ChromeStorage, type RawStorage } from '../../kv-storage/index.js';
import { type IQueue, QueueMemory } from '../../queue/index-memory.js';
import { uuidV4 } from '../../uid/uid.js';

type ActivityTrackerBrowserLocalOptions = ActivityTrackerOptions & {
    failsafe_active_sync_poll_ms?: number
}

export class ActivityTrackerBrowserLocal extends BaseActivityTracker implements IActivityTracker {
    
    
    
    #chromeStore:RawStorage;
    #failSafeSync:{every_ms:number, timer?: NodeJS.Timeout | number} = {every_ms: -1}
    #storageKey: string;
    #transaction:IQueue = new QueueMemory('');

    constructor(id: string, options?: ActivityTrackerBrowserLocalOptions, storage:chrome.storage.StorageArea = chrome.storage.local) {
        super(id, options);

        this.#chromeStore = new ChromeStorage(storage);
        
        this.#failSafeSync.every_ms = options?.failsafe_active_sync_poll_ms ?? (1000*20);
        this.#storageKey = `fetch_pacer_activity_tracker_${id}`;

        this.#loadActivitiesFromStorage();

        this.#chromeStore.events.on('CHANGE', (event) => {
            if( event.key===this.#storageKey ) {
                this.activities = event.newValue;
            }
        })
    }

    override async add(activity: ActivityItem): Promise<void> {
        const storedActivity = {...activity, id: uuidV4()};

        await this.#transaction.enqueue(async () => {
            await this.#loadActivitiesFromStorage();
            const newActivities = this.discardOldActivities([...this.activities, storedActivity]);
            await this.#chromeStore.set(this.#storageKey, newActivities);
            this.activities = newActivities;
        })
        
    }

    override async list(): Promise<StoredActivityItem[]> {
        return await this.#transaction.enqueue(async () => {
            return this.activities;
        })
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

    async #loadActivitiesFromStorage(): Promise<void> {
        const storedActivities: StoredActivityItem[] = await this.#chromeStore.get(this.#storageKey) ?? [];
        this.activities = storedActivities;
    }


    override async dispose(): Promise<void> {
        await super.dispose();
        await this.setActive(false);

        
    }
}