import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { ActivityTrackerKvStorage } from './activity-trackers/ActivityTrackerKvStorage.ts';
import { storageKeysFor } from './activity-trackers/storageKeys.ts';
import { FakeQuotaServer } from './testing-utils/FakeQuotaServer.ts';
import { LaggyKvStorage } from './testing-utils/LaggyKvStorage.ts';
import { expectBetweenNumbers, expectCloseTo } from './testing-utils/expectInRange.ts';
import { settle } from './testing-utils/settle.ts';
import { MemoryStorage } from '../kv-storage/index-node.ts';
import type { IKvStorage } from '../kv-storage/index-types.ts';
import type { FetchPacerOptions } from './types.ts';

const ID = 'shared-resource';

let made: FetchPacer[] = [];

/** A pacer for the resource that keeps its history in `store`, alongside any other pacer given the same store. */
function pacerSharing(store: IKvStorage, server: FakeQuotaServer, options?: Partial<FetchPacerOptions>): FetchPacer {
    const pacer = new FetchPacer(ID, {
        mode: { type: '429_preemptively' },
        max_points_per_second: 200,
        minimum_time_between_fetch: 0,
        custom_fetch_function: server.fetch,
        storage: { type: 'custom', activity_tracker: (id, trackerOptions) => new ActivityTrackerKvStorage(id, store, trackerOptions) },
        ...options
    });
    made = [...made, pacer];
    return pacer;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(async () => {
    await Promise.all(made.map(pacer => pacer.dispose()));
    made = [];
    vi.useRealTimers();
});

describe('two pacers sharing one store for the same resource', () => {

    it('does not hold one back after the other spent within quota', async () => {
        const store = new MemoryStorage();
        const server = new FakeQuotaServer(0);
        const a = pacerSharing(store, server);
        const b = pacerSharing(store, server);

        expect((await settle(a.fetch('https://svc/?points=100', undefined, 100))).status).toBe(200);

        expect(await b.getActiveBackOffForMs()).toBeUndefined();
        const response = await settle(b.fetch('https://svc/?points=50', undefined, 50));
        expect(response.status).toBe(200);
        expect(response.back_off_for_ms).toBeUndefined();
    });

    it('does hold one back after the other spent more than the window allows', async () => {
        const store = new MemoryStorage();
        const server = new FakeQuotaServer(0);
        const a = pacerSharing(store, server);
        const b = pacerSharing(store, server);

        await settle(a.fetch('https://svc/?points=300', undefined, 300));
        const askedAt = Date.now();
        const response = await settle(b.fetch('https://svc/?points=50', undefined, 50));

        // Held until A's spend leaves the one-second window, not until it has been "paid back".
        expect(response.status).toBe(429);
        expectCloseTo(1000 - askedAt, response.back_off_for_ms);
        expect(server.hits).toHaveLength(1);
    });

    it('leaves the refusal pause untouched by either one spending', async () => {
        // The pause is what a refusal earns; a pacer that was never refused must not find one.
        const store = new MemoryStorage();
        const server = new FakeQuotaServer(0);
        const a = pacerSharing(store, server);
        const refusalPauseKey = storageKeysFor(ID).backOffUntil;

        await settle(a.fetch('https://svc/?points=300', undefined, 300));
        expect(await store.get(refusalPauseKey)).toBeUndefined();

        await a.logBackOff();
        expect(await store.get(refusalPauseKey)).toBeGreaterThan(Date.now());
    });

    it('sees what another pacer spent while its own request was still being built', async () => {
        // Building a request can be slow (e.g. fetching a credential); whatever the other pacer
        // sends meanwhile must count against this one before it goes.
        const store = new MemoryStorage();
        const server = new FakeQuotaServer(0);
        const recovering = { mode: { type: 'attempt_recovery' }, max_points_per_second: 100 } as const;
        const a = pacerSharing(store, server, recovering);
        const b = pacerSharing(store, server, recovering);
        const slowToBuild = async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
            return {};
        };

        const fromA = a.fetch('https://svc/?points=100', slowToBuild, 100);
        await vi.advanceTimersByTimeAsync(1);
        expect((await settle(b.fetch('https://svc/?points=100', undefined, 100))).status).toBe(200);
        expect((await settle(fromA)).status).toBe(200);

        const [first, second] = server.hits;
        expect(second!.ts - first!.ts).toBeGreaterThanOrEqual(1000);
        expect(server.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(100);
    });

    describe('while one has a request in flight', () => {

        /**
         * Starts a request from `pacer` and returns once the service has received it, before it
         * answers. The answer comes back wrapped, as returning a bare promise would wait for it.
         */
        async function sentButUnanswered(pacer: FetchPacer, server: FakeQuotaServer, points: number): Promise<{ answer: Promise<unknown> }> {
            const answer = pacer.fetch(`https://svc/?points=${points}`, undefined, points);
            while( server.hits.length===0 ) await vi.advanceTimersByTimeAsync(1);
            return { answer };
        }

        it('counts what the other has sent but not yet heard back about', async () => {
            // The service charges a request when it receives it, not when it answers.
            const store = new MemoryStorage();
            const server = new FakeQuotaServer(500);
            const a = pacerSharing(store, server);
            const b = pacerSharing(store, server);

            const fromA = await sentButUnanswered(a, server, 100);
            const fromB = await settle(b.fetch('https://svc/?points=150', undefined, 150));

            expect(fromB.status).toBe(429);
            expectBetweenNumbers(990, 1000, fromB.back_off_for_ms);
            expect(server.hits).toHaveLength(1);
            expect(Date.now()).toBeLessThan(500);

            await settle(fromA.answer);
            expect(server.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(200);
        });

        it('still lets the other send what does fit beside the in-flight request', async () => {
            const store = new MemoryStorage();
            const server = new FakeQuotaServer(500);
            const a = pacerSharing(store, server);
            const b = pacerSharing(store, server);

            const fromA = await sentButUnanswered(a, server, 100);
            const fromB = await settle(b.fetch('https://svc/?points=100', undefined, 100));

            expect(fromB.status).toBe(200);
            expect(server.hits).toHaveLength(2);
            await settle(fromA.answer);
            expect(server.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(200);
        });

    });

    it('a slowly stored charge still keeps the next request inside a strict meter', async () => {
        // Only the first write, the first charge, is slow, taking longer than the whole window.
        // Were the send to wait for it, the request would go late while its charge claimed it
        // went on time, and the next request would follow straight after it.
        const store = new LaggyKvStorage((op, nth) => op==='set' && nth===0? 1100 : 0);
        const server = new FakeQuotaServer(0, { limit: 100, per_ms: 1000 });
        const pacer = pacerSharing(store, server, { max_points_per_second: 100 });

        expect((await settle(pacer.fetch('https://svc/?points=100', undefined, 100))).status).toBe(200);
        expect((await settle(pacer.fetch('https://svc/?points=100', undefined, 100))).status).toBe(200);

        const [first, second] = server.hits;
        expect(first!.ts).toBeLessThan(100);
        expect(second!.ts - first!.ts).toBeGreaterThanOrEqual(1000);
        expect(server.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(100);
    });

});
