import { describe, it, expect, vi } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import { ActivityTrackerMemory } from './activity-trackers/ActivityTrackerMemory.ts';
import type { FetchPacerOptions } from './types.ts';
import { expectCloseTo } from './testing-utils/expectInRange.ts';

/**
 * The shape of refusal this exists for: a status that usually means "not allowed", which only
 * a look at the body reveals to mean "not right now".
 */
const QUOTA_EXHAUSTED_BODY = { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } };
const NOT_ALLOWED_BODY = { error: { status: 'PERMISSION_DENIED', message: 'Not your mailbox' } };

/** Reads the body to tell a refusal for being too fast from a refusal for being wrong. */
const recognisesQuotaRefusals = async (response: Response): Promise<boolean> => {
    if (response.status !== 403) return false;
    const body = await response.json();
    return body?.error?.status === 'RESOURCE_EXHAUSTED';
};

function makePacer(
    activityTracker: ActivityTrackerMemory,
    reply: { status: number, body?: unknown, headers?: Record<string, string> },
    treat_as_back_off?: FetchPacerOptions['treat_as_back_off']
): FetchPacer {
    const config: FetchPacerOptions = {
        storage: {
            type: 'custom',
            activity_tracker: () => activityTracker
        },
        mode: {
            type: '429_preemptively'
        },
        custom_fetch_function: (async () => new Response(
            reply.body === undefined ? null : JSON.stringify(reply.body),
            { status: reply.status, headers: reply.headers }
        )) as unknown as typeof fetch,
        minimum_time_between_fetch: 0,
        back_off_calculation: { type: 'exponential' },
        testing_queue_disable_check_timeout: true,
        treat_as_back_off
    };
    return new FetchPacer('test', config);
}

describe('recognising a refusal that does not announce itself as one', () => {

    it('paces after a refusal only the body identifies as being for speed', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 403, body: QUOTA_EXHAUSTED_BODY }, recognisesQuotaRefusals);

        await pacer.fetch('https://example.com');

        expect(await activityTracker.getBackOffUntilTs()).toBeGreaterThan(Date.now());
    });

    it('carries on unpaced after a refusal that was about permission', async () => {
        // Backing off would achieve nothing here: waiting does not grant access.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 403, body: NOT_ALLOWED_BODY }, recognisesQuotaRefusals);

        await pacer.fetch('https://example.com');

        expect(await activityTracker.getBackOffUntilTs()).toBeUndefined();
    });

    it('leaves the body for the caller to read after looking at it', async () => {
        // The caller still has to report what went wrong, so reading the body to classify it
        // must not be the reason the body is gone.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 403, body: QUOTA_EXHAUSTED_BODY }, recognisesQuotaRefusals);

        const response = await pacer.fetch('https://example.com');

        expect(await response.json()).toEqual(QUOTA_EXHAUSTED_BODY);
    });

    it('hands back the status the service actually sent', async () => {
        // Pacing on a refusal must not disguise it as the refusal it resembles.
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 403, body: QUOTA_EXHAUSTED_BODY }, recognisesQuotaRefusals);

        const response = await pacer.fetch('https://example.com');

        expect(response.status).toBe(403);
    });

    it('waits as long as the classifier asks it to', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(
            activityTracker,
            { status: 403, body: QUOTA_EXHAUSTED_BODY },
            async () => ({ minimumMs: 30_000 })
        );

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        expectCloseTo(askedAt + 30_000, await activityTracker.getBackOffUntilTs(), 200);
    });

    it('still believes a service that named its own wait', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(
            activityTracker,
            { status: 403, body: QUOTA_EXHAUSTED_BODY, headers: { 'Retry-After': '45' } },
            recognisesQuotaRefusals
        );

        const askedAt = Date.now();
        await pacer.fetch('https://example.com');

        expectCloseTo(askedAt + 45_000, await activityTracker.getBackOffUntilTs(), 200);
    });

    it('does not bother asking about a refusal that already says it is about speed', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const classifier = vi.fn(async () => false);
        const pacer = makePacer(activityTracker, { status: 429 }, classifier);

        await pacer.fetch('https://example.com');

        expect(classifier).not.toHaveBeenCalled();
        expect(await activityTracker.getBackOffUntilTs()).toBeGreaterThan(Date.now());
    });

    it('paces exactly as it always did when no classifier was given', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 403, body: QUOTA_EXHAUSTED_BODY });

        await pacer.fetch('https://example.com');

        expect(await activityTracker.getBackOffUntilTs()).toBeUndefined();
    });

    it('counts a success as a success even though the classifier saw it', async () => {
        const activityTracker = new ActivityTrackerMemory('test');
        const pacer = makePacer(activityTracker, { status: 200, body: { ok: true } }, recognisesQuotaRefusals);

        const response = await pacer.fetch('https://example.com', undefined, 5);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

});
