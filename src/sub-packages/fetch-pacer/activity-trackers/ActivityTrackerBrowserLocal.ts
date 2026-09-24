/// <reference types="chrome" />


import type { IActivityTracker } from '../types.js';

import { ChromeStorage } from '../../kv-storage/adapters/ChromeStorage.ts';
import { ActivityTrackerKvStorage, type ActivityTrackerKvStorageOptions } from './ActivityTrackerKvStorage.ts';


/**
 * Records a resource's request history in chrome extension storage, so every context of an
 * extension (service worker, popup, tabs) paces against one shared history that also survives
 * the service worker being stopped.
 *
 * Used by pacers created with `storage: { type: 'browser-local' }`.
 *
 * @remarks
 * Behaves exactly as {@link ActivityTrackerKvStorage}. Every read lists the keys belonging to
 * the resource, which the chrome storage adapter does by reading the whole storage area, so
 * each check costs more the more unrelated data that area holds.
 */
export class ActivityTrackerBrowserLocal extends ActivityTrackerKvStorage implements IActivityTracker {


    /**
     * @param id The resource being paced; trackers with the same `id` share one history.
     * @param options How long history is kept.
     * @param storage The storage area to use. Defaults to `chrome.storage.local`.
     */
    constructor(id: string, options?: ActivityTrackerKvStorageOptions, storage?:chrome.storage.StorageArea) {
        const kvStorage = new ChromeStorage(storage ?? chrome.storage.local);
        super(id, kvStorage, options);


    }

}
