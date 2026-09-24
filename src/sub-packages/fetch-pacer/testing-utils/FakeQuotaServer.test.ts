import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeQuotaServer } from './FakeQuotaServer.ts';
import { settle } from './settle.ts';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('a stand-in service that meters what it is sent', () => {

    it('remembers when each request arrived and what it cost', async () => {
        const server = new FakeQuotaServer(0);

        const response = server.fetch('https://svc/?points=5');

        expect(server.hits).toEqual([{ ts: 0, points: 5 }]);
        await vi.advanceTimersByTimeAsync(0);
        await response;
    });

    it('answers only once its latency has passed', async () => {
        const server = new FakeQuotaServer(100);

        let answered = false;
        const response = server.fetch('https://svc/?points=1').then(r => { answered = true; return r; });

        await vi.advanceTimersByTimeAsync(99);
        expect(answered).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(answered).toBe(true);
        expect((await response).status).toBe(200);
    });

    it('reports the busiest sliding window', async () => {
        const server = new FakeQuotaServer(0);
        const sendAt = async (ts: number, points: number) => {
            vi.setSystemTime(ts);
            const response = server.fetch(`https://svc/?points=${points}`);
            await vi.advanceTimersByTimeAsync(0);
            await response;
        };

        await sendAt(0, 100);
        await sendAt(900, 100);
        await sendAt(1000, 100);
        await sendAt(2500, 50);

        // The window ending at 1000 holds 900 and 1000; the arrival at 0 has just left it.
        expect(server.maxPointsInAnySlidingWindow(1000)).toBe(200);
    });

    it('refuses when told the true limit was crossed', async () => {
        const server = new FakeQuotaServer(0, { limit: 100, per_ms: 1000 });

        const first = server.fetch('https://svc/?points=100');
        await vi.advanceTimersByTimeAsync(0);
        const second = server.fetch('https://svc/?points=100');
        await vi.advanceTimersByTimeAsync(0);

        expect((await first).status).toBe(200);
        expect((await second).status).toBe(429);
    });

    it('judges each arrival on what had arrived by then, not on what came later', async () => {
        const server = new FakeQuotaServer(50, { limit: 100, per_ms: 1000 });

        const [first, second] = await settle(Promise.all([
            server.fetch('https://svc/?points=100'),
            server.fetch('https://svc/?points=100')
        ]));

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
    });

});
