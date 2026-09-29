import { descriptorTextForError } from "./descriptorTextForError.ts";

/**
 * The reason a queued job did not complete: its queue was disposed first.
 *
 * Disposing a queue stops it for good. Every job it still holds, whether running or waiting its
 * turn, is rejected with this error, and so is any job enqueued afterwards. A job's function that
 * was already running is not interrupted, but its result is no longer delivered.
 *
 * @example
 * try {
 *     await queue.enqueue(sendEmail, 'send-email');
 * } catch(e) {
 *     if( e instanceof QueueDisposedError ) return; // shutting down: nothing to report
 *     throw e;
 * }
 *
 * @remarks
 * `name` is `'QueueDisposedError'`, which identifies it where `instanceof` cannot, such as when
 * two copies of this package are loaded.
 */
export class QueueDisposedError extends Error {
    override readonly name = 'QueueDisposedError';

    /** The id (or name) of the queue that was disposed. */
    readonly queueId: string;

    /** The descriptor the job was enqueued with, if it had one. */
    readonly descriptor?: string;

    /**
     * @param queueId - The id (or name) of the queue that was disposed.
     * @param descriptor - The descriptor the job was enqueued with, if any.
     */
    constructor(queueId: string, descriptor?: string) {
        super(`Queue [${queueId}] is disposed, so the job will not complete.${descriptorTextForError(descriptor)}`);
        this.queueId = queueId;
        if( descriptor!==undefined ) this.descriptor = descriptor;
    }
}
