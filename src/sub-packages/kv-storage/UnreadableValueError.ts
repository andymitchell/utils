/**
 * The reason a store could not read a value it holds: the stored value is there, but it cannot be
 * turned back into a value.
 *
 * It was sealed with another password, has been damaged or tampered with, is not JSON, or the
 * store's schema throws on it. Reading it again gives the same result, so a caller may treat the
 * value as absent or delete it. A failure of the storage itself (e.g. `chrome.storage` rejecting)
 * is never this error: it rejects with the adapter's own error, and a retry may succeed.
 *
 * @example
 * try {
 *     return await store.get(key);
 * } catch(e) {
 *     if( e instanceof UnreadableValueError ) return undefined; // damaged: it will never read
 *     throw e; // the storage failed: worth retrying
 * }
 *
 * @remarks
 * `name` is `'UnreadableValueError'`, which identifies it where `instanceof` cannot, such as when
 * two copies of this package are loaded. The message never names the key, because keys can hold
 * personal data; the underlying failure, if any, is the `cause`.
 */
export class UnreadableValueError extends Error {
    override readonly name = 'UnreadableValueError';

    /**
     * @param message - What is wrong with the value.
     * @param options - `cause`: the underlying failure, if any.
     */
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}
