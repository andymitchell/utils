import type { PreservableValueShape } from "./types.ts";

/**
 * Whole-value validators for each {@link PreservableValueShape}, used to gate the
 * `preserve_unmasked_paths` exemption. Kept apart from the masking regexes in
 * `simplePrivateDataReplacer` because their job is the opposite — proving a value is a known-safe,
 * non-secret identifier so it may be left unmasked at a chosen path.
 */

// UUID: standard 8-4-4-4-12 hex, any case, version-agnostic (accepts v1–v8 and the nil UUID). We gate on
// shape, not RFC version, so legitimate ids — including time-ordered v7 — are preserved rather than mangled.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ULID: Crockford base32, 26 chars, excludes I/L/O/U; first char is 0-7 (the 48-bit timestamp ceiling).
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/** Each shape's whole-value test. Add an entry here (and a union member in {@link PreservableValueShape}) to support a new shape. */
const VALUE_SHAPE_MATCHERS: Record<PreservableValueShape, (value: string) => boolean> = {
    uuid: (v) => UUID_RE.test(v),
    ulid: (v) => ULID_RE.test(v),
};

/**
 * Whole-value shape test — true only if the ENTIRE scalar is a valid instance of `shape`.
 *
 * Why whole-value (not substring): a partial match would let a secret be smuggled alongside an id
 * (e.g. `"<uuid> <jwt>"`), defeating the masker. Numbers never match `uuid`/`ulid` (both are strings).
 *
 * Fail-closed: an unrecognised shape (only reachable from a non-typed caller) has no OWN matcher and
 * returns `false`, so the value is masked rather than preserved. The own-property check is load-bearing —
 * a bare `VALUE_SHAPE_MATCHERS[shape]` would resolve inherited members like `toString`/`constructor` to
 * truthy functions and let arbitrary strings (including secrets) through unmasked.
 *
 * @example
 * matchesValueShape('550e8400-e29b-41d4-a716-446655440000', 'uuid'); // true
 * matchesValueShape('550e8400-e29b-41d4-a716-446655440000 x', 'uuid'); // false (trailing text)
 * matchesValueShape(123, 'uuid'); // false (not a string)
 */
export function matchesValueShape(value: string | number, shape: PreservableValueShape): boolean {
    if (typeof value !== 'string') return false;
    if (!Object.hasOwn(VALUE_SHAPE_MATCHERS, shape)) return false;
    return VALUE_SHAPE_MATCHERS[shape](value);
}
