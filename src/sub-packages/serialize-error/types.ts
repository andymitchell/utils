import type { JsonValue, JsonValueCapped } from "@andymitchell/clone-to-json-safe";


/**
 * Every field a serialized error carries except its cause — the shape the strict and lax variants share.
 *
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
interface SerializableErrorCore<MCD extends number = 6> {
    /** The human-readable error message. */
    message: string;
    /** The underlying cause of the error, if available. Can be any type, but restricted to being serializable. */
    cause_raw?: JsonValueCapped<MCD>;
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
 * A simplified, serializable representation of an error.
 *
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface SerializableCommonError<MCD extends number = 6> extends SerializableErrorCore<MCD> {
    /**
     * The underlying cause, but structured uniformly for nesting errors.
     */
    cause?: SerializableError<MCD>;
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

/**
 * A cause serialized by someone else — another library, another language, or by hand.
 *
 * It is accepted on the one field that makes it usable, a `message`, and may carry any further JSON-serializable
 * detail alongside. Holding a foreign cause to this serializer's own output shape would reject the error that carries
 * it, over a field whose whole job is to preserve someone else's diagnosis.
 *
 * @example
 * const cause: ForeignSerializedError = { message: 'socket hang up', name: 'FetchError', code: 'ECONNRESET' };
 */
export interface ForeignSerializedError {
    /** The human-readable error message — the one field a foreign cause must carry to be worth keeping. */
    message: string;
    /** Any further detail the foreign producer attached, so long as it survives JSON. */
    [detail: string]: JsonValue;
}

/**
 * A cause this serializer produced, or one it did not.
 *
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export type LaxSerializableCause<MCD extends number = 6> = SerializableError<MCD> | ForeignSerializedError;

/**
 * A serialized error whose nested cause may have come from anywhere.
 *
 * Parse with this when the error is untrusted input — a response from another implementation, a value off the wire.
 * Produce {@link SerializableCommonError}; accept this. Every {@link SerializableCommonError} is one of these, so a
 * consumer widening to it loses nothing.
 *
 * @template MCD The max depth of the cause, if it's an object. It's capped to prevent excessive recursion.
 */
export interface LaxSerializableCommonError<MCD extends number = 6> extends SerializableErrorCore<MCD> {
    /** The underlying cause, structured by this serializer or by whoever produced it. */
    cause?: LaxSerializableCause<MCD>;
}
