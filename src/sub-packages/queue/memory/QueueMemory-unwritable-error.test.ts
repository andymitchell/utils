import { describe, it, expect } from 'vitest';

import { QueueMemory } from './QueueMemory.ts';

describe('a job that fails with an error it cannot annotate', () => {

    it('still reports the failure to whoever is waiting on it', async () => {
        // An aborted or timed out fetch rejects with a DOMException, whose message is a getter with
        // no setter. Annotating it in place throws inside the queue's own error handling, before
        // the job is settled — so the caller waits on a promise that will never resolve.
        const queue = new QueueMemory('unwritable-error');

        const job = queue.enqueue(async () => {
            throw new DOMException('The operation was aborted', 'AbortError');
        });

        await expect(job).rejects.toThrow(/The operation was aborted/);
    });

    it('leaves the error recognisable, so a caller can tell why it failed', async () => {
        const queue = new QueueMemory('unwritable-error-identity');

        const job = queue.enqueue(async () => {
            throw new DOMException('signal timed out', 'TimeoutError');
        });

        await expect(job).rejects.toMatchObject({ name: 'TimeoutError' });
    });

    it('goes on to run the jobs queued behind it', async () => {
        // The failure is reported from the same step that advances the queue, so an escape there
        // stalls everything waiting, not just the job that failed.
        const queue = new QueueMemory('unwritable-error-continues');

        const failing = queue.enqueue(async () => {
            throw new DOMException('The operation was aborted', 'AbortError');
        });
        const following = queue.enqueue(async () => 'ran anyway');

        await expect(failing).rejects.toThrow();
        await expect(following).resolves.toBe('ran anyway');
    });

});
