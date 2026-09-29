/** Stands in for "it resolved", so a rejection with any value (even `undefined`) is told apart from success. */
export const RESOLVED = Symbol('resolved');

/**
 * What a promise rejected with, or `RESOLVED` if it did not reject.
 *
 * Lets a test assert on exactly what a caller would catch, including falsy values that a
 * `try`/`catch` flag or `.rejects` matcher would blur.
 *
 * @param promise - The promise to settle.
 * @returns The rejection value, unchanged, or `RESOLVED`.
 */
export async function rejectionOf(promise: PromiseLike<unknown>): Promise<unknown> {
    try {
        await promise;
        return RESOLVED;
    } catch(e) {
        return e;
    }
}
