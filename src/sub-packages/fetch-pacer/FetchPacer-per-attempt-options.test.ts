import { describe, it, expect } from 'vitest';

import FetchPacer from './FetchPacer.ts';
import FetchPacerMultiClient from './FetchPacerMultiClient.ts';
import type { FetchPacerOptions } from './types.ts';

/** Reads back the credential each attempt actually presented. */
function recordingFetch(credentialsSeen: string[], refuseFirst = true): typeof fetch {
    let attempts = 0;
    return (async (_url: string, init?: RequestInit) => {
        credentialsSeen.push((init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? 'none');
        attempts++;
        return new Response(null, { status: refuseFirst && attempts === 1 ? 429 : 200 });
    }) as unknown as typeof fetch;
}

function recoveringConfig(fetchFunction: typeof fetch): FetchPacerOptions {
    return {
        mode: {
            type: 'attempt_recovery',
            timeout_ms: 10_000
        },
        back_off_calculation: { type: 'exponential' },
        custom_fetch_function: fetchFunction,
        minimum_time_between_fetch: 0,
        testing_queue_disable_check_timeout: true
    };
}

describe('a request that has to be attempted more than once', () => {

    it('asks for a fresh credential for every attempt', async () => {
        // A retry can land minutes after the first try. A credential captured up front may well
        // have expired by then, so the request would fail for a reason that has nothing to do
        // with why it was held back.
        const credentialsSeen: string[] = [];
        const pacer = new FetchPacer('resource', recoveringConfig(recordingFetch(credentialsSeen)));

        let issued = 0;
        const response = await pacer.fetch('https://example.com', async () => ({
            headers: { Authorization: `Bearer token-${++issued}` }
        }));

        expect(response.status).toBe(200);
        expect(credentialsSeen).toEqual(['Bearer token-1', 'Bearer token-2']);
    });

    it('accepts a plain set of options, as it always has', async () => {
        const credentialsSeen: string[] = [];
        const pacer = new FetchPacer('resource', recoveringConfig(recordingFetch(credentialsSeen)));

        const response = await pacer.fetch('https://example.com', {
            headers: { Authorization: 'Bearer fixed' }
        });

        expect(response.status).toBe(200);
        expect(credentialsSeen).toEqual(['Bearer fixed', 'Bearer fixed']);
    });

    it('accepts options built without waiting for anything', async () => {
        const credentialsSeen: string[] = [];
        const pacer = new FetchPacer('resource', recoveringConfig(recordingFetch(credentialsSeen)));

        let issued = 0;
        await pacer.fetch('https://example.com', () => ({
            headers: { Authorization: `Bearer token-${++issued}` }
        }));

        expect(credentialsSeen).toEqual(['Bearer token-1', 'Bearer token-2']);
    });

    it('builds the options once when the request succeeds first time', async () => {
        // Rebuilding is for retries; a request that is answered should cost one build.
        const credentialsSeen: string[] = [];
        const pacer = new FetchPacer('resource', recoveringConfig(recordingFetch(credentialsSeen, false)));

        let issued = 0;
        await pacer.fetch('https://example.com', async () => ({
            headers: { Authorization: `Bearer token-${++issued}` }
        }));

        expect(issued).toBe(1);
        expect(credentialsSeen).toEqual(['Bearer token-1']);
    });

    it('asks for a fresh credential per attempt when routed through a client id', async () => {
        const credentialsSeen: string[] = [];
        const pacer = new FetchPacerMultiClient('resource', recoveringConfig(recordingFetch(credentialsSeen)));

        let issued = 0;
        const response = await pacer.fetch('https://example.com', async () => ({
            headers: { Authorization: `Bearer token-${++issued}` }
        }), 1, 'user-a');

        expect(response.status).toBe(200);
        expect(credentialsSeen).toEqual(['Bearer token-1', 'Bearer token-2']);
    });

});
