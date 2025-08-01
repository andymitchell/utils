import type { JsonValueCapped } from "../deep-clone-scalar-values/index.ts";


/**
 * A simplified, serializable representation of an error.
 * 
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface SerializableCommonError<MCD extends number = 6> {
    /** The human-readable error message. */
    message: string;
    /** The underlying cause of the error, if available. Can be any type, but restricted to being serializable. */
    cause?: JsonValueCapped<MCD>;
    /** The stack trace at the time the error was thrown, if available. */
    stack?: string;
    /** The type or name of the error (e.g., "TypeError", "ValidationError"). */
    name?: string;
}

/**
 * A simplified, serializable representation of an error, along with the format of the original error it is serialising. 
 * 
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface SerializableError<MCD extends number = 6> extends SerializableCommonError<MCD> {
    originalFormat: 'Error' | 'undefined' | 'string' | 'object' | 'other' | 'internal-error';
}
