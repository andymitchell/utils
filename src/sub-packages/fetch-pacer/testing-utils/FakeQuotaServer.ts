import type { Fetch } from '../types.ts';

/** One request as the service saw it arrive. */
export type QuotaHit = {
    /** When the request arrived, in ms since the epoch. */
    readonly ts: number;
    /** What the request cost, read from its `points` query parameter (0 when absent). */
    readonly points: number;
};

/** The true limit the service enforces, and how it answers a request that crosses it. */
export type QuotaRefusalRule = {
    /** Most points the service accepts inside any one window. */
    readonly limit: number;
    /** Length of the sliding window, in ms. */
    readonly per_ms: number;
    /** When set, a refusal carries a `Retry-After` header naming this many seconds. */
    readonly retry_after_s?: number;
};

/**
 * A stand-in for a rate-limited web service, which records every request it is sent so a test
 * can check the pace it was actually driven at.
 *
 * Pass its `fetch` wherever a pacer takes a custom fetch function. Each request states its cost
 * in a `points` query parameter (`https://svc/?points=5`); the server notes the arrival time and
 * cost, waits out its latency on the (fake) clock, and answers 200 — or 429 when it has been given
 * a true limit and the request crossed it.
 *
 * @example
 * vi.useFakeTimers();
 * const server = new FakeQuotaServer(50, { limit: 100, per_ms: 1000 });
 * const pacer = new FetchPacer('svc', { custom_fetch_function: server.fetch, max_points_per_second: 100, ... });
 * // ...drive requests with fake time...
 * expect(server.maxPointsInAnySlidingWindow(1000)).toBeLessThanOrEqual(100);
 *
 * @remarks
 * Whether a request is refused is decided the instant it arrives, on what had arrived by then.
 * A request arriving later at the same instant can therefore never turn an earlier one away,
 * matching a real service that meters on receipt.
 *
 * A refused request still counts towards the window, as some services charge for refused calls;
 * this keeps the stand-in on the conservative side.
 */
export class FakeQuotaServer {
    readonly #hits: QuotaHit[] = [];

    /**
     * @param latencyMs How long each answer takes, measured on the timer clock (fake timers
     * control it).
     * @param refusal The true limit to enforce. Omit for a service that never refuses.
     */
    constructor(
        private readonly latencyMs: number,
        private readonly refusal?: QuotaRefusalRule
    ) {}

    /** Every request received so far, oldest first. */
    get hits(): readonly QuotaHit[] {
        return [...this.#hits];
    }

    /** Answers a request as the service would; see the class description. */
    readonly fetch: Fetch = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const points = Number(url.searchParams.get('points') ?? 0);

        // Read before any await, so the record is the moment of arrival.
        const ts = Date.now();
        this.#hits.push({ ts, points });
        const refused = this.refusal !== undefined && this.#sumEndingAt(ts, this.refusal.per_ms) > this.refusal.limit;

        await new Promise<void>(resolve => setTimeout(resolve, this.latencyMs));

        if (refused) {
            const retryAfterS = this.refusal?.retry_after_s;
            return new Response(null, { status: 429, headers: retryAfterS === undefined ? {} : { 'Retry-After': String(retryAfterS) } });
        }
        return new Response(null, { status: 200 });
    };

    /**
     * The most points received inside any one window of the given length.
     *
     * @param perMs Window length in ms.
     * @returns The busiest window's total, evaluated at every arrival; 0 when nothing has arrived.
     *
     * @remarks
     * A window ending at time `t` holds arrivals in `(t − perMs, t]`: one that arrived exactly
     * `perMs` earlier has already left. Only windows ending on an arrival need checking, because
     * a window's total can only grow when an arrival enters it.
     */
    maxPointsInAnySlidingWindow(perMs: number): number {
        return this.#hits.reduce((busiest, hit) => Math.max(busiest, this.#sumEndingAt(hit.ts, perMs)), 0);
    }

    /**
     * The average rate of spend over a stretch of time.
     *
     * @param from Start of the stretch, inclusive, in ms since the epoch.
     * @param to End of the stretch, exclusive.
     * @returns Points received in `[from, to)` per second.
     */
    pointsPerSecond(from: number, to: number): number {
        const spent = this.#hits
            .filter(hit => hit.ts >= from && hit.ts < to)
            .reduce((sum, hit) => sum + hit.points, 0);
        return spent / ((to - from) / 1000);
    }

    #sumEndingAt(end: number, perMs: number): number {
        return this.#hits
            .filter(hit => hit.ts > end - perMs && hit.ts <= end)
            .reduce((sum, hit) => sum + hit.points, 0);
    }
}
