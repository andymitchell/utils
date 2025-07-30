import { cloneDeepScalarValues } from "../deep-clone-scalar-values/cloneDeepScalarValues.ts";

export interface SerializableError {
    message: string;
    cause?: unknown;
    stack?: string;
    name?: string;
    originalFormat: 'Error' | 'undefined' | 'string' | 'object' | 'other' | 'internal-error';
}


/**
 * Converts an unknown error input into a standardized, serializable error object.
 *
 * This function handles typical JavaScript `Error` instances, objects with error-like properties,
 * strings, and even non-serializable values. The output is safe to log, send over the wire, or
 * store, since it removes or deep-clones unsafe or circular structures (via `cloneDeepScalarValues`).
 *
 * ### Supported Inputs
 * - `Error` instances: preserves name, message, stack, and cause.
 * - Plain objects: attempts to extract common error-like properties (`message`, `stack`, `cause`, `name`).
 * - Strings: returned as the `message`.
 * - Anything else: JSON-stringifies it (or uses a fallback message).
 *
 * @param error - Any value that might represent an error, such as an `Error`, string, or object.
 * @returns A `SerializableError` object containing safe-to-serialize details.
 *
 * @example
 * ```ts
 * const err = new Error("Something broke");
 * const safeErr = serializeError(err);
 * // {
 * //   name: "Error",
 * //   message: "Something broke",
 * //   stack: "...",
 * //   cause: undefined
 * // }
 * ```
 *
 * @example
 * ```ts
 * const err = "Oops!";
 * const safeErr = serializeError(err);
 * // { message: "Oops!" }
 * ```
 *
 * @example
 * ```ts
 * const err = { message: "Boom", cause: { code: 500 } };
 * const safeErr = serializeError(err);
 * // {
 * //   message: "Boom",
 * //   cause: { code: 500 }
 * // }
 * ```
 */
export function serializeError(error: unknown): SerializableError {
    try {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                cause: cloneDeepScalarValues(error.cause ?? {}, false),
                originalFormat: 'Error'
            };
        } else if (typeof error === 'object' && error !== null) {
            const serializable: Partial<SerializableError> = {};
            if ('message' in error && typeof (error as any).message === 'string') {
                serializable.message = (error as any).message;
            } else {
                try {
                    serializable.message = JSON.stringify(error);
                } catch {
                    serializable.message = 'Could not serialize the error object.';
                }
            }
            if ('cause' in error) {
                serializable.cause = cloneDeepScalarValues((error as any).cause, false);
            }
            if ('stack' in error && typeof (error as any).stack === 'string') {
                serializable.stack = (error as any).stack;
            }
            if ('name' in error && typeof (error as any).name === 'string') {
                serializable.name = (error as any).name;
            }
            serializable.originalFormat = 'object';
            return serializable as SerializableError;
        } else if (typeof error === 'string') {
            return {
                message: error,
                originalFormat: 'string'
            };
        } else if( error===undefined ) {
            return {
                message: 'undefined',
                originalFormat: 'undefined'
            }
        } else {
            return {
                message: JSON.stringify(error),
                originalFormat: 'other'
            };
        }
        
    } catch(e) {
        let reason: string = "no additional info";
        try {
            reason = (e as Error).message;
        } catch {}

        return {
            message: `An unknown error occurred that could not be serialized (${reason}).`,
            originalFormat: 'internal-error'
        };
    }
}