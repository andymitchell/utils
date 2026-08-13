/**
 * Add context to an error's message without assuming the message can be written to.
 *
 * `Error.message` is an ordinary writable property on the errors most code creates, but not on all
 * of them: `DOMException` — which is what an aborted or timed out `fetch` rejects with — exposes it
 * as a getter with no setter. Assigning to that throws, and an error thrown while reporting an
 * error escapes from a place no caller is watching, leaving the original failure unreported.
 *
 * @param error - The error to annotate. It is modified in place, as callers expect to keep the
 * error's identity so `instanceof` and `name` checks still work.
 * @param suffix - Text to add to the end of the message.
 *
 * @example
 * appendToErrorMessage(error, ' [descriptor: send-email]');
 * // error.message === 'Network unreachable [descriptor: send-email]'
 *
 * @remarks
 * The message is redefined as an own property, which shadows any inherited getter. An error that
 * refuses even that — a frozen one — keeps its original message: the added context is a
 * convenience, and losing it matters far less than losing the error.
 */
export function appendToErrorMessage(error: Error, suffix: string): void {
    try {
        Object.defineProperty(error, 'message', {
            value: `${error.message}${suffix}`,
            writable: true,
            enumerable: false,
            configurable: true
        });
    } catch (e) {
        // Nothing further to try, and the error itself still has to reach its caller.
    }
}
