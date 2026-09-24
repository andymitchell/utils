import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import PaceTracker from './PaceTracker.ts';
import { ActivityTrackerKvStorage } from './activity-trackers/ActivityTrackerKvStorage.ts';
import { FakeQuotaServer } from './testing-utils/FakeQuotaServer.ts';
import { LaggyKvStorage } from './testing-utils/LaggyKvStorage.ts';
import { settle } from './testing-utils/settle.ts';
import { MemoryStorage } from '../kv-storage/index-node.ts';
import type { IKvStorage } from '../kv-storage/index-types.ts';
import type { PaceTrackerOptions } from './types.ts';

const ID = 'slow-store';

/**
 * A store holding a refusal pause that ends at `refusedUntilTs`, where listing the history takes
 * 250 ms and everything else answers at once. The pause is set before the delays apply, so
 * setting it up costs no simulated time.
 */
async function storeRefusedUntil(refusedUntilTs: number): Promise<LaggyKvStorage> {
    const inner: IKvStorage = new MemoryStorage();
    await new ActivityTrackerKvStorage(ID, inner).setBackOffUntilTs(refusedUntilTs);
    return new LaggyKvStorage(op => op==='getAllKeys'? 250 : 0, undefined, inner);
}

/** Pacing options that keep the history in `store`, with a quota so that the history is read. */
function sharing(store: LaggyKvStorage): PaceTrackerOptions {
    return {
        max_points_per_second: 100,
        storage: { type: 'custom', activity_tracker: (id, trackerOptions) => new ActivityTrackerKvStorage(id, store, trackerOptions) }
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('answering while the store is slow to read', () => {

    it.each([100, 400])('ends a wait when the refusal pause ends, however long the answer took (pause ends at %i)', async (refusedUntilTs) => {
        const pt = new PaceTracker(ID, sharing(await storeRefusedUntil(refusedUntilTs)));

        const answer = await settle(pt.getPauseBeforeMs(0).then(pauseMs => ({ pauseMs, at: Date.now() })), 1);

        expect(answer.at).toBeGreaterThanOrEqual(250);
        expect(answer.at + (answer.pauseMs ?? 0)).toBe(Math.max(answer.at, refusedUntilTs));
    });

    it('sends a request whose refusal pause ran out while its history was being read', async () => {
        // The pause ends at 100 but the answer takes until 250: a wait still counted from before
        // the read would run past the 300 ms allowed and give up on a request free to go.
        const server = new FakeQuotaServer(0);
        const pacer = new FetchPacer(ID, {
            ...sharing(await storeRefusedUntil(100)),
            mode: { type: 'attempt_recovery', timeout_ms: 300 },
            minimum_time_between_fetch: 0,
            custom_fetch_function: server.fetch
        });

        const response = await settle(pacer.fetch('https://svc/?points=1', undefined, 1), 1);

        expect(response.status).toBe(200);
        expect(response.cannot_recover).toBeUndefined();
        expect(server.hits.length).toBe(1);
        await pacer.dispose();
    });

});
