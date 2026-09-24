import { MemoryStorage } from '../../kv-storage/index-node.ts';
import type { IActivityTracker } from '../activity-tracker-types.ts';
import { ActivityTrackerKvStorage, type ActivityTrackerKvStorageOptions } from './ActivityTrackerKvStorage.ts';

/**
 * Records a resource's request history in memory that belongs to this tracker alone, so no
 * other pacer shares it and it ends with the tracker.
 *
 * Used by pacers created with `storage: { type: 'memory' }`, which is the default.
 *
 * @remarks
 * Behaves exactly as {@link ActivityTrackerKvStorage} over a store of its own.
 */
export class ActivityTrackerMemory extends ActivityTrackerKvStorage implements IActivityTracker {

    /**
     * @param id The resource being paced.
     * @param options How long history is kept.
     */
    constructor(id: string, options?: ActivityTrackerKvStorageOptions) {
        super(id, new MemoryStorage(), options);
    }

}
