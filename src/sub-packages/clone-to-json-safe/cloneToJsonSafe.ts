import { simplePrivateDataReplacer } from "./simplePrivateDataReplacer.ts";
import {
    GETTER_RULE,
    matchRule,
    primitiveRule,
    REDACT_MARKER_TAGS,
    resolveNonSerialisable,
} from "./nonSerialisableRegistry.ts";
import type { LeafResolution } from "./nonSerialisableRegistry.ts";
import type { CloneToJsonSafeOptions, JsonSafe, Scalar } from "./types.ts";


const unsafeKeys = Object.freeze(['__proto__', 'constructor', 'prototype']);

// Built-in `valueOf` for each boxed-primitive type. Unwrapping through these (not a value's own
// `valueOf`) reads the internal slot directly, so a wrapper with a hijacked `valueOf` cannot run code.
const numberValueOf = Number.prototype.valueOf;
const stringValueOf = String.prototype.valueOf;
const booleanValueOf = Boolean.prototype.valueOf;

// Caps `normalise`'s `toJSON` honouring so a pathological `toJSON` returning fresh `toJSON`-bearing
// objects cannot recurse without bound.
const MAX_TOJSON_DEPTH = 16;

// Bounds the prototype-chain walk when resolving a property by descriptor, so a Proxy that fabricates an
// endless chain of prototypes cannot make the walk hang.
const MAX_PROTO_DEPTH = 100;

// A string this module produced: `redact:<tag>` optionally followed by `:<detail>` (which may itself contain `:`).
const REDACT_MARKER_RE = /^redact:([A-Za-z]+)(?::([\s\S]*))?$/;

/** The value used for each option when the caller does not supply it. */
const DEFAULT_OPTIONS: Required<CloneToJsonSafeOptions> = Object.freeze({
    non_serialisable_handling: 'drop',
    strip_sensitive_info: false,
    allow_sensitive_in_dangerous_properties: false,
    skip_circular: false,
    allow_symbols: false,
    allow_getters: false,
});

/** Applies the caller's options over the defaults, producing a value for every field. */
function resolveOptions(options?: CloneToJsonSafeOptions): Required<CloneToJsonSafeOptions> {
    return { ...DEFAULT_OPTIONS, ...options };
}

/**
 * Deep-clones any input into a form safe to serialise to JSON, keeping only scalar values.
 *
 * If the input is an object or array it is cloned recursively (see {@link cloneToJsonSafe}); a scalar
 * input is returned as-is; a value with no faithful JSON representation (`bigint`, `Date`, function,
 * symbol, …) follows {@link CloneToJsonSafeOptions.non_serialisable_handling}. Use this when the input
 * type is unknown; use {@link cloneToJsonSafe} when it is known to be an object or array.
 *
 * @param obj - The value to clone. Can be anything.
 * @param options - See {@link CloneToJsonSafeOptions}.
 * @returns A JSON-safe clone of `obj`, or `undefined` if the top-level value is dropped.
 *
 * @example
 * cloneToJsonSafeUnknown({ a: 1, fn: () => 0 }); // { a: 1 }
 * cloneToJsonSafeUnknown('hello');               // 'hello'
 * cloneToJsonSafeUnknown(10n, { non_serialisable_handling: 'redact' }); // 'redact:bigint:10'
 */
export function cloneToJsonSafeUnknown<T = any>(obj: T, options?: CloneToJsonSafeOptions): JsonSafe<T> | Scalar | undefined {
    const resolved = resolveOptions(options);
    const resolution = resolveLeaf(obj, resolved, new WeakMap(), new WeakSet());
    if (resolution.kind === 'drop') return undefined;
    return maybeStrip(resolution.value, resolved, '') as JsonSafe<T> | Scalar | undefined;
}

/**
 * Deep-clones an object or array into a form safe to serialise to JSON, keeping scalar leaves and
 * recursing plain objects, arrays, class instances and TypedArrays.
 *
 * Values with no faithful JSON representation (`bigint`, `NaN`, `±Infinity`, `Date`, `URL`, `Map`,
 * `Set`, `RegExp`, `Promise`, functions, symbols, getters) are dropped, normalised or redacted per
 * {@link CloneToJsonSafeOptions.non_serialisable_handling} (default: dropped). In `redact` mode a few
 * types blend a safe value into the marker (`redact:Date:<iso>`, `redact:URL:<href>`,
 * `redact:bigint:<digits>`, `redact:RegExp:<pattern>`, `redact:URLSearchParams:<query>`); the value may
 * contain `:`, so split a marker on its first two colons only.
 *
 * @param obj - The object or array to clone.
 * @param options - See {@link CloneToJsonSafeOptions}.
 * @returns A JSON-safe clone of `obj`.
 *
 * @example
 * cloneToJsonSafe({ id: 1n, name: 'Bob', at: new Date('2026-06-18') });
 * // drop (default):              { name: 'Bob' }
 * // { non_serialisable_handling: 'normalise' }: { id: null, name: 'Bob', at: '2026-06-18T00:00:00.000Z' }
 * // { non_serialisable_handling: 'redact' }:    { id: 'redact:bigint:1', name: 'Bob', at: 'redact:Date:2026-06-18T00:00:00.000Z' }
 */
export function cloneToJsonSafe<T extends object | Array<any>>(obj: T, options?: CloneToJsonSafeOptions): JsonSafe<T> {
    return internalCloneToJsonSafe<T>(obj, resolveOptions(options));
}


/** Recursion core: clones an object's own keys, routing every value through {@link resolveLeaf}. */
function internalCloneToJsonSafe<T extends object>(
    obj: T,
    options: Required<CloneToJsonSafeOptions>,
    // Store original:clone
    antiCircularMap: WeakMap<object, any> = new WeakMap(),
    // Objects on the live recursion path, used to tell a true cycle from a merely-shared reference
    ancestors: WeakSet<object> = new WeakSet(),
): JsonSafe<T> {

    // 1. Check if we have already cloned this specific object
    if (antiCircularMap.has(obj)) {
        return antiCircularMap.get(obj);
    }

    // 2. Prepare the container
    const isArray = Array.isArray(obj);
    const safeVersion: any = isArray ? [] : {};

    // 3. CRITICAL: Register the clone BEFORE recursion, so a child that references `obj` resolves to it.
    antiCircularMap.set(obj, safeVersion);
    ancestors.add(obj);

    const mode = options.non_serialisable_handling;

    try {
        for (const key of Reflect.ownKeys(obj)) {
            if (typeof key === 'string' && unsafeKeys.includes(key)) continue;
            if (!options.allow_symbols && typeof key === 'symbol') continue;

            const keyAsString = String(key);

            let resolution: LeafResolution;
            if (options.allow_getters) {
                // You probably don't want to do this. It's too easy for a getter to have side effects.
                let value: unknown;
                let threw = false;
                try {
                    value = (obj as any)[key];
                } catch {
                    // A getter that throws is treated as unread, exactly like a getter we never run.
                    threw = true;
                }
                resolution = threw
                    ? resolveNonSerialisable(GETTER_RULE, undefined, mode)
                    : resolveLeaf(value, options, antiCircularMap, ancestors);
            } else {
                const descriptor = Object.getOwnPropertyDescriptor(obj, key);
                if (!descriptor) continue;
                // A getter is never executed (it could pollute the prototype or otherwise have side effects).
                resolution = descriptor.get
                    ? resolveNonSerialisable(GETTER_RULE, undefined, mode)
                    : resolveLeaf(descriptor.value, options, antiCircularMap, ancestors);
            }

            if (resolution.kind === 'value') {
                safeVersion[key] = maybeStrip(resolution.value, options, keyAsString);
            } else if (mode === 'normalise' && isArray) {
                // `JSON.stringify` turns a dropped array element into `null` (it cannot leave a hole).
                safeVersion[key] = null;
            }
            // otherwise: omit the key (object) / leave the array hole (drop + redact)
        }

        return safeVersion as JsonSafe<T>;
    } finally {
        ancestors.delete(obj);
    }
}

/**
 * Classifies one value and decides what it becomes in the clone — the heart of the function.
 *
 * Keeps clean scalars, recurses cleanly-walkable objects (plain, class instance, Error, TypedArray),
 * and routes everything with no faithful JSON representation through the non-serialisable registry so a
 * single mode governs them uniformly. Sensitive-info masking is applied by the caller, not here.
 */
function resolveLeaf(
    value: unknown,
    options: Required<CloneToJsonSafeOptions>,
    antiCircularMap: WeakMap<object, any>,
    ancestors: WeakSet<object>,
    toJSONDepth = 0,
): LeafResolution {
    const mode = options.non_serialisable_handling;

    // A boxed primitive becomes its primitive value; a wrapper with a forged prototype is dropped without running its code.
    const boxed = unwrapBoxedPrimitive(value);
    if (boxed.kind === 'forged') return { kind: 'drop' };
    if (boxed.kind === 'unwrapped') value = boxed.primitive;

    if (value === null) return { kind: 'value', value: null };
    if (value === undefined) return { kind: 'drop' };

    if (typeof value === 'object') {
        const obj = value;

        // A value already on the recursion path is a true circular reference.
        if (options.skip_circular && ancestors.has(obj)) return { kind: 'drop' };

        // Classified by an internal-slot brand check, never by `Object.prototype.toString`: reading the
        // toString tag would invoke a `Symbol.toStringTag` accessor and is spoofable into mis-typing a value.
        const rule = matchRule(obj);
        if (rule) return resolveNonSerialisable(rule, obj, mode);

        // An object carrying a data-property `toJSON` (Decimal, Luxon, …) that JSON.stringify would honour.
        // The method is resolved from descriptors so probing for it never invokes an accessor named `toJSON`.
        const toJSON = getToJSONMethod(obj);
        if (toJSON) return resolveToJSONObject(obj, toJSON, options, antiCircularMap, ancestors, toJSONDepth);

        // Cleanly walkable: plain object, array, class instance, Error, TypedArray.
        return { kind: 'value', value: internalCloneToJsonSafe(obj, options, antiCircularMap, ancestors) };
    }

    if (typeof value === 'symbol' && options.allow_symbols) {
        return { kind: 'value', value };
    }

    const rule = primitiveRule(value);
    if (rule) return resolveNonSerialisable(rule, value, mode);

    // JSON-native scalar (string, boolean, finite number) — the caller applies sensitive-info masking.
    return { kind: 'value', value };
}

/**
 * Handles an object with a data-property `toJSON` that is not a known built-in: `normalise` mirrors
 * `JSON.stringify` by calling the method; `redact` traces its constructor name without calling it; `drop`
 * omits it (so its internal fields never leak). Only `normalise` runs the method, so executing the value's
 * code is confined to the mode that opts into JSON-stringify fidelity.
 */
function resolveToJSONObject(
    obj: object,
    toJSON: (this: unknown) => unknown,
    options: Required<CloneToJsonSafeOptions>,
    antiCircularMap: WeakMap<object, any>,
    ancestors: WeakSet<object>,
    toJSONDepth: number,
): LeafResolution {
    const mode = options.non_serialisable_handling;
    if (mode === 'drop') return { kind: 'drop' };
    if (mode === 'redact') return { kind: 'value', value: `redact:${ctorName(obj)}` };

    if (toJSONDepth < MAX_TOJSON_DEPTH) {
        try {
            const produced = toJSON.call(obj);
            return resolveLeaf(produced, options, antiCircularMap, ancestors, toJSONDepth + 1);
        } catch {
            // A throwing toJSON yields no value, so recurse the object's own keys instead.
        }
    }
    return { kind: 'value', value: internalCloneToJsonSafe(obj, options, antiCircularMap, ancestors) };
}

/** Masks a string/number value when stripping is enabled; redact markers keep their prefix and only their detail is masked. */
function maybeStrip(value: unknown, options: Required<CloneToJsonSafeOptions>, keyAsString: string): unknown {
    if (!shouldStripSensitiveInfo(value, options, keyAsString)) return value;
    return typeof value === 'string' ? stripSensitiveText(value) : simplePrivateDataReplacer(value);
}

/**
 * Masks sensitive substrings, but recognises this module's own `redact:<knownTag>:<detail>` markers and
 * masks only the detail — so the `redact:<tag>` prefix is never mangled by the token rule. The known-tag
 * guard avoids treating an arbitrary `a:b:c` value as a marker.
 */
function stripSensitiveText(text: string): string {
    const m = REDACT_MARKER_RE.exec(text);
    if (m && m[1] && REDACT_MARKER_TAGS.has(m[1])) {
        return m[2] !== undefined ? `redact:${m[1]}:${simplePrivateDataReplacer(m[2])}` : `redact:${m[1]}`;
    }
    return simplePrivateDataReplacer(text);
}

/** Whether a scalar value should be masked: it is a string or number, stripping is enabled, and it is not an allowed `_dangerous` property. */
function shouldStripSensitiveInfo(x: unknown, options: Required<CloneToJsonSafeOptions>, key?: string): boolean {
    return (typeof x === 'string' || typeof x === 'number')
        && options.strip_sensitive_info
        && !(options.allow_sensitive_in_dangerous_properties && !!key?.startsWith('_dangerous'));
}

/**
 * The value of `obj[key]` resolved by inspecting property descriptors along the prototype chain. A data
 * property yields its value; an accessor yields `undefined` and is never read — so probing a value for a
 * property cannot run a getter. The walk is depth-capped so a Proxy fabricating an endless prototype chain
 * cannot hang it.
 */
function dataPropertyValue(obj: object, key: string): unknown {
    let current: object | null = obj;
    for (let depth = 0; current && depth < MAX_PROTO_DEPTH; depth++) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}

/** The object's `toJSON` only when it is a data-property method; an accessor `toJSON` is reported absent rather than read, so detection never runs a getter. */
function getToJSONMethod(obj: object): ((this: unknown) => unknown) | undefined {
    const value = dataPropertyValue(obj, 'toJSON');
    return typeof value === 'function' ? value as (this: unknown) => unknown : undefined;
}

/** The object's constructor name for a `redact:<Type>` trace, read through data-property descriptors so a `constructor`/`name` accessor is never invoked; defaults to `Object`. */
function ctorName(obj: object): string {
    const ctor = dataPropertyValue(obj, 'constructor');
    const name = typeof ctor === 'function' ? dataPropertyValue(ctor, 'name') : undefined;
    return typeof name === 'string' && name ? name : 'Object';
}

/** The outcome of inspecting a value for a boxed primitive. */
type BoxedUnwrapResult =
    | { kind: 'not-boxed' }
    | { kind: 'unwrapped'; primitive: number | string | boolean }
    | { kind: 'forged' };

/**
 * Unwraps a boxed primitive (`new Number`/`String`/`Boolean`) to its primitive value so it is kept as a scalar.
 * A wrapper with a forged prototype is reported as `forged` rather than having any of its code run.
 */
function unwrapBoxedPrimitive(value: unknown): BoxedUnwrapResult {
    try {
        if (value instanceof Number) return { kind: 'unwrapped', primitive: numberValueOf.call(value) };
        if (value instanceof String) return { kind: 'unwrapped', primitive: stringValueOf.call(value) };
        if (value instanceof Boolean) return { kind: 'unwrapped', primitive: booleanValueOf.call(value) };
    } catch {
        return { kind: 'forged' }; // instanceof matched but the object has no primitive internal slot
    }
    return { kind: 'not-boxed' };
}
