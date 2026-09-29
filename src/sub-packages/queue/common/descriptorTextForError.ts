import type { BaseItem } from "../types.ts";

/**
 * Text that names a job at the end of a reason the queue gives for ending it.
 *
 * Reasons such as "Externally halted." say what happened but not to which job; the descriptor the
 * job was enqueued with fills that in. A job with no descriptor adds nothing, rather than a
 * placeholder that names nothing.
 *
 * @param descriptor - The label the job was enqueued with, if any.
 * @returns ` [descriptor: <descriptor>]`, or an empty string when there is no descriptor.
 *
 * @example
 * 'Externally halted.' + descriptorTextForError('send-email'); // 'Externally halted. [descriptor: send-email]'
 * 'Externally halted.' + descriptorTextForError(undefined);    // 'Externally halted.'
 */
export function descriptorTextForError(descriptor?: BaseItem['descriptor'] | null):string {
    if( descriptor===undefined || descriptor===null ) return '';
    return ` [descriptor: ${descriptor}]`;
}
