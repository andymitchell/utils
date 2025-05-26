import { describe, it, expect, beforeEach, afterEach, vi, type MockedClass, type Mocked } from 'vitest';
import PaceTracker from './PaceTracker.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal.ts';
import type { ActivityItem, IActivityTracker, StoredActivityItem } from './types.ts';


// Mock dependencies for constructor tests
vi.mock('./activity-trackers/ActivityTrackerMemory');
vi.mock('./activity-trackers/ActivityTrackerBrowserLocal');

const mockActivityTrackerMemory = ActivityTrackerMemory as MockedClass<typeof ActivityTrackerMemory>;
const mockActivityTrackerBrowserLocal = ActivityTrackerBrowserLocal as MockedClass<typeof ActivityTrackerBrowserLocal>;

describe('Constructor and Initialization', () => {

    

    let mockTracker: Mocked<IActivityTracker>;
    let storedActivities: StoredActivityItem[];
    let currentBackOffUntilTs: number | undefined;
    const initialTime = new Date('2023-01-01T00:00:00.000Z').getTime();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(initialTime);

        storedActivities = [];
        currentBackOffUntilTs = undefined;

        mockTracker = {
            add: vi.fn(async (item: ActivityItem) => {
                storedActivities.push({ ...item, id: `id-${storedActivities.length}`, timestamp: item.timestamp });
            }),
            setActive: vi.fn().mockResolvedValue(undefined),
            isActive: vi.fn().mockResolvedValue(false),
            setBackOffUntilTs: vi.fn(async (ts: number, options) => {
                if (options?.onlyIfExceedsCurrentTs && typeof currentBackOffUntilTs === 'number' && ts <= currentBackOffUntilTs) {
                    return;
                }
                currentBackOffUntilTs = ts;
            }),
            getBackOffUntilTs: vi.fn(async () => currentBackOffUntilTs),
            list: vi.fn(async () => [...storedActivities]), // Return a copy
            dispose: vi.fn().mockResolvedValue(undefined),
        };

        mockActivityTrackerMemory.mockClear();
        mockActivityTrackerBrowserLocal.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Restores Math.random as well
        vi.useRealTimers();
    });
    
    it('should use memory storage by default if no options are provided', () => {
        new PaceTracker('test-id'); // No custom tracker, will try to instantiate real MemoryTracker
        expect(mockActivityTrackerMemory).toHaveBeenCalledTimes(1);
        expect(mockActivityTrackerMemory).toHaveBeenCalledWith('test-id', { clear_activities_older_than_ms: 1000 * 60 * 5 });
    });
    
    it('should use memory storage when specified', () => {
        new PaceTracker('test-id', { storage: { type: 'memory' } });
        expect(mockActivityTrackerMemory).toHaveBeenCalledTimes(1);
        expect(mockActivityTrackerMemory).toHaveBeenCalledWith('test-id', { clear_activities_older_than_ms: 1000 * 60 * 5 });
    });

    it('should use browser-local storage when specified', () => {
        new PaceTracker('test-id', { storage: { type: 'browser-local' } });
        expect(mockActivityTrackerBrowserLocal).toHaveBeenCalledTimes(1);
        expect(mockActivityTrackerBrowserLocal).toHaveBeenCalledWith('test-id', { clear_activities_older_than_ms: 1000 * 60 * 5 });
    });

    it('should use custom storage when specified', () => {
        const customTrackerFactory = vi.fn(() => mockTracker);
        new PaceTracker('test-id', { storage: { type: 'custom', activity_tracker: customTrackerFactory } });
        expect(customTrackerFactory).toHaveBeenCalledTimes(1);
        expect(customTrackerFactory).toHaveBeenCalledWith('test-id', { clear_activities_older_than_ms: 1000 * 60 * 5 });
    });


    it('should throw an error for unknown storage type', () => {
        expect(() => new PaceTracker('test-id', { storage: { type: 'unknown-type' as any } }))
            .toThrow("Unknown activity tracker");
    });
});
