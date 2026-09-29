import type { JobItem, JobOutcome } from "../types.ts";
import { descriptorTextForError } from "./descriptorTextForError.ts";

/**
 * Settles the promise a job's caller is waiting on, according to how the job ended.
 *
 * A job's own failure reaches its caller untouched: the same value, with nothing added to it, so
 * the caller can match on its message, compare its identity or check its `name`. Only a reason the
 * queue gives itself (halted, timed out) carries the job's descriptor, as that is text the queue
 * owns and the only clue to which job it means.
 *
 * @param job - The waiting job: the callbacks that settle its caller's promise, and its descriptor.
 * @param outcome - How the job ended.
 *
 * @example
 * settleJob(job, {type: 'threw', error});  // caller rejects with `error`, unchanged
 * settleJob(job, {type: 'queue_reason', reason: 'Externally halted.'});
 * // caller rejects with 'Externally halted. [descriptor: send-email]'
 */
export function settleJob(job: Pick<JobItem, 'resolve' | 'reject' | 'descriptor'>, outcome: JobOutcome): void {
    switch( outcome.type ) {
        case 'returned':
            job.resolve(outcome.output);
            return;
        case 'threw':
            job.reject(outcome.error);
            return;
        case 'queue_reason':
            job.reject(outcome.reason + descriptorTextForError(job.descriptor));
            return;
        default: {
            const unhandled: never = outcome;
            throw new Error(`Unknown job outcome: ${JSON.stringify(unhandled)}`);
        }
    }
}
