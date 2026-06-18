import type { JsonValueCapped } from "../clone-to-json-safe/index.ts";


/**
 * A simplified, serializable representation of an error.
 * 
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface SerializableCommonError<MCD extends number = 6> {
    /** The human-readable error message. */
    message: string;
    /** The underlying cause of the error, if available. Can be any type, but restricted to being serializable. */
    cause_raw?: JsonValueCapped<MCD>;
    /**
     * The underlying cause, but structured uniformly for nesting errors. 
     */
    cause?: SerializableError<MCD>;
    /** The stack trace at the time the error was thrown, if available. */
    stack?: string;
    /** The type or name of the error (e.g., "TypeError", "ValidationError"). */
    name?: string;

    /**
     * Preserves the original thrown value (or a safe clone of it) for primitives / non-error throws.
     * Keep this small/safe — we use cloneDeepScalarValues for objects.
     */
    raw?: unknown;

    /**
     * Details if the serialization itself fails 
     * (You already had an 'internal-error' format; this adds structure.)
     */
    internal_error?: {
        message: string;
        cause?: unknown; // best-effort, already in a failure path
    };
}

/**
 * A simplified, serializable representation of an error, along with the format of the original error it is serialising. 
 * 
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface SerializableError<MCD extends number = 6> extends SerializableCommonError<MCD> {
    /**
     * The type of the *thrown value* (e.g. 'Error', 'string', 'number', 'object', 'undefined', 'symbol', etc.)
     * Similar to your new function’s `type`.
     */
    type: 'Error' | 'undefined' | 'null' | 'string' | 'number' | 'boolean' | 'object' | 'other' | 'internal-error';
}
