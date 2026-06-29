import { isTypeEqual } from "../../index-browser.ts";

export function isScalar(x: unknown): x is Scalar {
    return x===null || typeof x==='number' || typeof x==='boolean' || typeof x==='string';
}

export type Scalar = string | number | boolean | null;

/**
 * A JSON-safe version of an existing type: the shape {@link cloneToJsonSafe} produces. Functions and
 * symbols collapse to `never`; nested objects and arrays are mapped recursively. The runtime value of a
 * non-serialisable leaf depends on `non_serialisable_handling` (it may be dropped, `null`, or a
 * `redact:<Type>` string), so treat this as a best-effort static shape.
 */
export type JsonSafe<T> = T extends Function
    ? never
    : T extends Scalar
    ? T
    : T extends Array<infer U>
    ? Array<JsonSafe<U>>
    : T extends object
    ? { [K in keyof T]: JsonSafe<T[K]> }
    : never;


/**
 * How a value with no faithful JSON representation is handled.
 *
 * - `'drop'` — omit it.
 * - `'normalise'` — replace it with what `JSON.stringify` would emit.
 * - `'redact'` — replace it with a `redact:<Type>` marker.
 */
export type NonSerialisableHandling = 'drop' | 'normalise' | 'redact';

/**
 * The named value-shapes a {@link PreserveUnmaskedPath} can require.
 *
 * A "shape" is a whole-value grammar for a value that is non-secret by design (an opaque identifier),
 * so preserving it unmasked at a chosen path is safe. The set is intentionally closed and named — not an
 * open RegExp — so every exemption is auditable and a new shape is added deliberately, one reviewed entry
 * at a time. Extend by adding a member here and a matcher in `valueShapes.ts`.
 */
export type PreservableValueShape = 'uuid' | 'ulid';

/**
 * A single unmask exemption: preserve a scalar UNMASKED only where BOTH conditions hold — its location
 * matches {@link PreserveUnmaskedPath.path} AND its value is a whole-value match for {@link PreserveUnmaskedPath.shape}.
 */
export type PreserveUnmaskedPath = {
    /**
     * Exact dot-path from the cloned root to the scalar, e.g. `'user.id'` or `'order.items.0.ref'`.
     * Array elements use their numeric index. Matching is exact — no wildcards, no prefixes: a path
     * either names one location or it names nothing. (A property key that literally contains `.` is
     * ambiguous and cannot be targeted.)
     */
    path: string;
    /** The value-shape the scalar must fully match to be preserved. */
    shape: PreservableValueShape;
};

/**
 * Options for `cloneToJsonSafe` / `cloneToJsonSafeUnknown`.
 */
export type CloneToJsonSafeOptions = {
    /**
     * How to handle values with no faithful JSON representation — `bigint`, `NaN`, `±Infinity`,
     * `Date`, `URL`, `Map`, `Set`, `RegExp`, `Promise`, functions, symbols and unread getters. Picking
     * a mode lets the clone round-trip through `JSON.stringify` without throwing or silently
     * corrupting data.
     *
     * - `'drop'` (default): omit the offending key entirely — the clone keeps only cleanly
     *   serialisable values.
     * - `'normalise'`: replace with what `JSON.stringify` would produce — `Date`→ISO string,
     *   `URL`→href string, `bigint`/`NaN`/`±Infinity`→`null`, `Map`/`Set`/`RegExp`/`Promise`→`{}`,
     *   function/symbol dropped — so the result is valid JSON while keeping as much meaning as possible.
     * - `'redact'`: keep the key but replace the value with a `redact:<Type>` marker, optionally with a
     *   safe value blended in (`redact:Date:<iso>`, `redact:URL:<href>`, `redact:bigint:<digits>`,
     *   `redact:RegExp:<pattern>`, `redact:URLSearchParams:<query>`), leaving a debugging trace. The
     *   value may itself contain `:`, so split a marker on its first two colons only.
     *
     * @default 'drop'
     */
    non_serialisable_handling?: NonSerialisableHandling;
    /** Mask sensitive-looking scalar values such as tokens, emails and long digit sequences. @default false */
    strip_sensitive_info?: boolean;
    /** When `strip_sensitive_info` is on, leave values of properties whose key starts with `_dangerous` unmasked. @default false */
    allow_sensitive_in_dangerous_properties?: boolean;
    /** Omit a property whose value points back to one of its own ancestors, instead of recreating the cycle in the clone. @default false */
    skip_circular?: boolean;
    /**
     * Keep Symbol-keyed properties and Symbol values. Off by default because symbols have no JSON
     * representation: a Symbol key is dropped and a Symbol value follows `non_serialisable_handling`.
     * When on, Symbol keys are cloned and Symbol values kept as-is.
     * @default false
     */
    allow_symbols?: boolean;
    /**
     * Execute getters and clone their returned value. Off by default because getters can run
     * arbitrary code with side effects; when off a getter follows `non_serialisable_handling` (e.g.
     * `redact:Getter`) and is never executed. A getter that throws is always treated as unread.
     * @default false
     */
    allow_getters?: boolean;
    /**
     * Exemptions that keep a scalar UNMASKED, gated by BOTH its dot-path AND its value-shape. Only
     * consulted when {@link CloneToJsonSafeOptions.strip_sensitive_info} is on. A value is preserved only
     * where its location matches an entry's `path` AND the value is a whole-value match for that entry's
     * `shape` (e.g. a UUID at `user.id`). Every other value — including a non-matching value at that same
     * path — is still masked.
     *
     * Why path AND shape, and never a bare "allow any value at this path": a path-only allowlist trusts a
     * location to forever hold a safe value, but a field's contents drift — a `user.id` that holds a UUID
     * today may hold an email or token after a refactor. A path-only exemption would silently keep passing
     * whatever lands there: left wide open on the wrong type, with no signal. Pairing it with a shape makes
     * the exemption self-validating and fail-closed — the instant the value stops matching the declared
     * shape it is masked again. (For the same auditability reason `shape` is a closed, named set, not an
     * arbitrary RegExp, so an over-broad pattern can't be introduced by accident.)
     *
     * @default []
     * @example
     * cloneToJsonSafe(ctx, { strip_sensitive_info: true, preserve_unmasked_paths: [
     *     { path: 'user.id',  shape: 'uuid' },
     *     { path: 'trace.id', shape: 'ulid' },
     * ]});
     */
    preserve_unmasked_paths?: PreserveUnmaskedPath[];
};


/**
 * A serializable representation of any value.
 *
 */
export type JsonValue =
  | Scalar
  | JsonValue[]
  | { [key: string]: JsonValue };





/**
 * A version of `JsonValue` with its recursive depth capped.
 */
export type JsonValueCapped<D extends number = 6> = D extends 0
  ? Scalar
  :
      | Scalar
      | JsonValueCapped<Decrement<D>>[]
      | { [key: string]: JsonValueCapped<Decrement<D>> };
type Decrement<N extends number> = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...number[]][N];
isTypeEqual<JsonValueCapped, JsonValue>(true);


/**
 * Alias of {@link JsonSafe}.
 */
export type DeepSerializable<T> = JsonSafe<T>;