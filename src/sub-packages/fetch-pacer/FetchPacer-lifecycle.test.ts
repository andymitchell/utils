import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { FakeQuotaServer } from './testing-utils/FakeQuotaServer.ts';
import { settle } from './testing-utils/settle.ts';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('winding a pacer down', () => {

    it('leaves no timer behind once its requests are answered and it is disposed', async () => {
        // A timer left running keeps a script or worker alive after it has finished its work.
        const server = new FakeQuotaServer(0);
        const pacer = new FetchPacer('svc', {
            mode: { type: '429_preemptively' },
            max_points_per_second: 100,
            minimum_time_between_fetch: 0,
            custom_fetch_function: server.fetch
        });

        const response = await settle(pacer.fetch('https://svc/?points=1', undefined, 1));
        await pacer.dispose();

        expect(response.status).toBe(200);
        expect(vi.getTimerCount()).toBe(0);
    });

});
