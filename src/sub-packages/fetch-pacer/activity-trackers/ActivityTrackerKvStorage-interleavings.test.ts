import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityTrackerKvStorage } from './ActivityTrackerKvStorage.ts';
import { storageKeysFor } from './storageKeys.ts';
import { LaggyKvStorage } from '../testing-utils/LaggyKvStorage.ts';
import { mulberry32 } from '../testing-utils/mulberry32.ts';
import { settle } from '../testing-utils/settle.ts';
import type { StoredActivityItem } from '../types.ts';

const ID = 'shared-resource';
const RETENTION_MS = 1000;
const WRITERS = 3;
const SCENARIOS = 150;

type Step = { readonly gapMs: number; readonly does: 'add' | 'list' };

/** A charge that had been stored, and the moment (in the order of events) its writer heard so. */
type Stored = { readonly points: number; readonly ts: number; readonly storedAt: number };

/** What one reader was shown, when it started asking, and the time it was answered. */
type Read = { readonly startedAt: number; readonly answeredTs: number; readonly items: readonly StoredActivityItem[] };

/**
 * Each writer's script: a pause, then record a charge or read the history. Half the pauses are
 * short, so operations overlap in the store; half land near the retention period, so charges
 * are made and read just as earlier ones age out.
 */
function randomScripts(seed: number): Step[][] {
    const random = mulberry32(seed);
    const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    return Array.from({ length: WRITERS }, () => Array.from({ length: between(8, 16) }, () => ({
        gapMs: random() < 0.5 ? between(0, 60) : between(RETENTION_MS - 60, RETENTION_MS + 60),
        does: random() < 0.5 ? 'add' : 'list'
    })));
}

/**
 * Plays every writer's script at once over one store whose every operation takes 0–60 ms, and
 * records what was stored and what each reader was shown. Every charge costs a different number
 * of points, so it can be recognised wherever it turns up.
 */
async function play(seed: number) {
    const lag = mulberry32(seed * 7919 + 1);
    const store = new LaggyKvStorage(() => Math.floor(lag() * 61));
    const trackers = Array.from({ length: WRITERS }, () => new ActivityTrackerKvStorage(ID, store, { clear_activities_older_than_ms: RETENTION_MS }));

    let events = 0;
    let nextPoints = 1;
    let stored: Stored[] = [];
    let reads: Read[] = [];

    const perform = async (tracker: ActivityTrackerKvStorage, steps: Step[]) => {
        for (const step of steps) {
            await new Promise(resolve => setTimeout(resolve, step.gapMs));
            if (step.does === 'add') {
                const charge = { points: nextPoints++, ts: Date.now() };
                await tracker.add({ type: 'reserved', timestamp: charge.ts, points: charge.points });
                stored = [...stored, { ...charge, storedAt: events++ }];
            } else {
                const startedAt = events++;
                const items = await tracker.list();
                reads = [...reads, { startedAt, answeredTs: Date.now(), items }];
            }
        }
    };

    const scripts = randomScripts(seed);
    await settle(Promise.all(trackers.map((tracker, i) => perform(tracker, scripts[i]!))), 1000);
    return { store, trackers, stored, reads };
}

/** Charges a reader should have been shown but was not, and any it was shown twice. */
function whatWentWrong(stored: readonly Stored[], read: Read) {
    const shown = read.items.flatMap(item => item.type === 'reserved' ? [item.points] : []);
    const due = stored.filter(charge => charge.storedAt < read.startedAt && charge.ts >= read.answeredTs - RETENTION_MS);
    return {
        missing: due.filter(charge => !shown.includes(charge.points)),
        repeated: shown.filter((points, i) => shown.indexOf(points) !== i)
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('what writers sharing a store read, whatever its timing', () => {

    it('shows each reader every charge stored before it asked that still counts, and each only once', async () => {
        let failures: { seed: number; read: Read; missing: Stored[]; repeated: number[] }[] = [];
        for (let seed = 1; seed <= SCENARIOS; seed++) {
            const { stored, reads, trackers } = await play(seed);
            for (const read of reads) {
                const { missing, repeated } = whatWentWrong(stored, read);
                if (missing.length > 0 || repeated.length > 0) failures = [...failures, { seed, read, missing, repeated }];
            }
            await Promise.all(trackers.map(tracker => tracker.dispose()));
        }

        expect(failures.slice(0, 3)).toEqual([]);
    });

    it('keeps nothing but the latest record once all earlier history has aged out and one writer records again', async () => {
        let leftBehind: { seed: number; keys: string[] }[] = [];
        for (let seed = 1; seed <= SCENARIOS; seed++) {
            const { store, trackers } = await play(seed);

            // Twice the retention: whatever layout the history uses, none of it can still count.
            await vi.advanceTimersByTimeAsync(2 * RETENTION_MS + 1);
            await settle(trackers[0]!.add({ type: 'reserved', timestamp: Date.now(), points: 0 }), 1000);

            const keys = await settle(store.getAllKeys(storageKeysFor(ID).logPrefix));
            if (keys.length !== 1) leftBehind = [...leftBehind, { seed, keys }];
            await Promise.all(trackers.map(tracker => tracker.dispose()));
        }

        expect(leftBehind.slice(0, 3)).toEqual([]);
    });

});
