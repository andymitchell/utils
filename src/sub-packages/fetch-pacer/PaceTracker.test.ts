import { describe, test, expect} from 'vitest';
import { PaceTrackerOptions } from './types';
import { sleep } from '../../main';
import PaceTracker from './PaceTracker';
import closeTo from './testing-utils/closeTo';
import { ActivityTrackerBrowserLocal } from './activity-trackers/ActivityTrackerBrowserLocal';
import { MockChromeStorageArea } from '../kv-storage';


standardPaceTrackerTests(
    () => ({
        storage: {
            type: 'memory'
        }
    })
)



standardPaceTrackerTests(
    () => ({
        storage: {
            type: 'custom',
            activity_tracker: (id, options) => new ActivityTrackerBrowserLocal(id, options, new MockChromeStorageArea())
        }
    })
)


function standardPaceTrackerTests(baseTestConfig: () => Partial<PaceTrackerOptions>) {

    // Factory function to create FetchPacer with custom config
    function makeTest(optionalTestConfig: Partial<PaceTrackerOptions> = {}): PaceTracker {
        const config: PaceTrackerOptions = {
            hail_mary_after_many_failures: false,
            ...baseTestConfig(),
            ...optionalTestConfig,
        };
        return new PaceTracker('test', config);
    }

    describe('basic', () => {
        test(`checkPace will allow proceed`, async () => {
            const paceChecker = makeTest({max_points_per_second: 5, back_off_calculation: {type: 'exponential'}});
    
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(false);
        })
    })
    
    describe('Points and Rate Limiting (No Back Off)', () => {
    
        test('Can proceed within points limit', async () => {
            
            const paceChecker = makeTest({ max_points_per_second: 5 });
            
            await paceChecker.logPoints(3);
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(false);
        });
    
        test('staggered requests if exceeding max points per second', async () => {
            
            const paceChecker = makeTest({ max_points_per_second: 5 });
    
    
            await paceChecker.logPoints(3);
            await paceChecker.logPoints(3);
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
    
            await sleep(1000);
    
            const pace2 = await paceChecker.checkPace(0);
            expect(pace2.too_fast).toBe(false);
    
        });
    
        test('if use points greater than a maximum, it will allow burst but delay the next', async () => {
            
            const paceChecker = makeTest({ max_points_per_second: 5 });
    
            const pace = await paceChecker.checkPace(10);
            expect(pace.too_fast).toBe(false);
            await paceChecker.logPoints(10);
    
            const pace2 = await paceChecker.checkPace(3);
            expect(pace2.too_fast).toBe(true);
    
        })
    
        test(`checkPace pauses for points: 1x period`, async () => {
            
            const paceChecker = makeTest({
                max_points_per_second: 5
            });
    
            await paceChecker.logPoints(6);
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.pause_for).toBeGreaterThanOrEqual(1000);
            expect(pace.pause_for).toBeLessThanOrEqual(2000);
            expect(!!pace.is_back_off).toBe(false);
        })
    
    
        test(`checkPace pauses for points: 2x period`, async () => {
            
            const paceChecker = makeTest({
                max_points_per_second: 5
            });
    
            await paceChecker.logPoints(12); // Nb it's twice the max point load of the period. That'll take 2 periods to clear. 
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.pause_for).toBeGreaterThanOrEqual(2000);
            expect(pace.pause_for).toBeLessThanOrEqual(3000);
            expect(!!pace.is_back_off).toBe(false);
        })
    });
    
    // # No points / max-points-per-second. Back Off.
    describe('Back Off (No Points)', () => {
    
        test('will back off', async () => {
            
    
            const paceChecker = makeTest({ back_off_calculation: { type: 'exponential' } });
    
            await paceChecker.logBackOffResponse();
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.is_back_off).toBe(true);
            expect(closeTo(pace.pause_for, 100)).toBe(true);
    
        });
    
        test('back off will clear', async () => {
            
    
            const paceChecker = makeTest({ back_off_calculation: { type: 'exponential' } });
    
            await paceChecker.logBackOffResponse();
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.is_back_off).toBe(true);
            expect(closeTo(pace.pause_for, 100)).toBe(true);
    
            
            await sleep(100);
            const pace2 = await paceChecker.checkPace(0);
            expect(pace2.too_fast).toBe(false);
        });
    
        test('exponential back off on multiple 429 responses', async () => {
            
            const paceChecker = makeTest({ back_off_calculation: { type: 'exponential' } });
    
            await paceChecker.logBackOffResponse();
            await paceChecker.logBackOffResponse();
            await paceChecker.logBackOffResponse();
    
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.is_back_off).toBe(true);
            expect(closeTo(pace.pause_for, 400)).toBe(true);
    
        });
    
    });
    
    // # Points / max-points-per-second. Back Off.
    describe('Points, Rate Limiting, and Back Off', () => {
    
    
        test(`with both excess points and 429, if 429 greater it returns that`, async () => {
            
            const paceChecker = makeTest({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });
    
            await paceChecker.logPoints(6);
            await paceChecker.logBackOffResponse(2000);
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.pause_for).toBeGreaterThanOrEqual(2000)
            expect(pace.is_back_off).toBe(true);
        })
    
        test(`with both excess points and 429, if points greater it returns that`, async () => {
            
            const paceChecker = makeTest({ max_points_per_second: 5, back_off_calculation: { type: 'exponential' } });
    
            await paceChecker.logPoints(6);
            await paceChecker.logBackOffResponse(500);
            const pace = await paceChecker.checkPace(0);
            expect(pace.too_fast).toBe(true);
            expect(pace.pause_for).toBeGreaterThan(1000-1)
            expect(!!pace.is_back_off).toBe(false);
        })
    });
    
}

