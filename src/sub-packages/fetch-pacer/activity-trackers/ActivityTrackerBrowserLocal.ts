/// <reference types="chrome" />


import type { IActivityTracker } from '../types.js';

import { ChromeStorage } from '../../kv-storage/adapters/ChromeStorage.ts';
import { ActivityTrackerKvStorage, type ActivityTrackerKvStorageOptions } from './ActivityTrackerKvStorage.ts';


export class ActivityTrackerBrowserLocal extends ActivityTrackerKvStorage implements IActivityTracker {
    
    
    constructor(id: string, options?: ActivityTrackerKvStorageOptions, storage?:chrome.storage.StorageArea) {
        const kvStorage = new ChromeStorage(storage ?? chrome.storage.local);
        super(id, kvStorage, options);

        
    }

}