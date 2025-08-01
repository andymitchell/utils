import type { JsonValue } from "../deep-clone-scalar-values/types.ts";


/**
 * A simplified, serializable representation of an error.
 */
export interface SerializableCommonError {
    /** The human-readable error message. */
    message: string;
    /** The underlying cause of the error, if available. Can be any type, but restricted to being serializable. */
    cause?: JsonValue;
    /** The stack trace at the time the error was thrown, if available. */
    stack?: string;
    /** The type or name of the error (e.g., "TypeError", "ValidationError"). */
    name?: string;
}

export interface SerializableError extends SerializableCommonError {
    originalFormat: 'Error' | 'undefined' | 'string' | 'object' | 'other' | 'internal-error';
}
