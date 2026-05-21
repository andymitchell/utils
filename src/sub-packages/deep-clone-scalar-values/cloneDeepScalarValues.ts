import { simplePrivateDataReplacer } from "./simplePrivateDataReplacer.ts";
import { isScalar, type ClonedDeepScalarValues, type CloneDeepScalarValuesOptions, type Scalar } from "./types.ts";


const unsafeKeys = Object.freeze(['__proto__', 'constructor', 'prototype']);

// Built-in `valueOf` for each boxed-primitive type. Unwrapping through these (not a value's own
// `valueOf`) reads the internal slot directly, so a wrapper with a hijacked `valueOf` cannot run code.
const numberValueOf = Number.prototype.valueOf;
const stringValueOf = String.prototype.valueOf;
const booleanValueOf = Boolean.prototype.valueOf;

/** The value used for each option when the caller does not supply it. */
const DEFAULT_OPTIONS: Required<CloneDeepScalarValuesOptions> = Object.freeze({
    strip_sensitive_info: false,
    allow_sensitive_in_dangerous_properties: false,
    skip_circular: false,
    skip_symbols: false,
    allow_getters: false,
});

/** Applies the caller's options over the defaults, producing a value for every field. */
function resolveOptions(options?: CloneDeepScalarValuesOptions): Required<CloneDeepScalarValuesOptions> {
    return { ...DEFAULT_OPTIONS, ...options };
}

/**
 * Deep-clones any input, keeping only scalar values (string, number, boolean, null).
 *
 * If the input is an object or array it is cloned recursively (see {@link cloneDeepScalarValues});
 * a scalar input is returned as-is; anything else (function, symbol, undefined) yields `undefined`.
 * Use this when the input type is unknown; use {@link cloneDeepScalarValues} when it is known to be an object or array.
 *
 * @param obj - The value to clone. Can be anything.
 * @param options - See {@link CloneDeepScalarValuesOptions}.
 * @returns A clone of `obj` containing only scalar values.
 *
 * @example
 * cloneDeepScalarValuesAny({ a: 1, fn: () => 0 }); // { a: 1 }
 * cloneDeepScalarValuesAny('hello');               // 'hello'
 */
export function cloneDeepScalarValuesAny<T = any>(obj: T, options?: CloneDeepScalarValuesOptions): ClonedDeepScalarValues<T> | Scalar | undefined {
    const resolved = resolveOptions(options);

    // A boxed primitive becomes its primitive value, so it is treated as a scalar rather than cloned to {}.
    const boxed = unwrapBoxedPrimitive(obj);
    if (boxed.kind === 'forged') return undefined;
    if (boxed.kind === 'unwrapped') {
        return shouldStripSensitiveInfo(boxed.primitive, resolved)
            ? simplePrivateDataReplacer(boxed.primitive)
            : boxed.primitive;
    }

    if( Array.isArray(obj) || (typeof obj==='object' && obj!==null) ) {
        return cloneDeepScalarValues(obj, resolved);
    } else {
        if( isScalar(obj) ) {
            if ( shouldStripSensitiveInfo(obj, resolved) ) {
                return simplePrivateDataReplacer(obj);
            } else {
                return obj;
            }
        } else {
            return undefined;
        }
    }
}

/**
 * Deep-clones an object or array, keeping only scalar values (string, number, boolean, null).
 *
 * Function and symbol values are dropped; nested objects and arrays are cloned recursively. By
 * default a circular reference is recreated in the clone. See {@link CloneDeepScalarValuesOptions}
 * to drop circular or Symbol-keyed entries, mask sensitive values, or read getters.
 *
 * @param obj - The object or array to clone.
 * @param options - See {@link CloneDeepScalarValuesOptions}.
 * @returns A clone of `obj` containing only scalar values.
 *
 * @example
 * cloneDeepScalarValues({ name: 'Bob', greet: () => 'hi' }); // { name: 'Bob' }
 */
export function cloneDeepScalarValues<T extends object | Array<any>>(obj: T, options?: CloneDeepScalarValuesOptions): ClonedDeepScalarValues<T> {
    return internalCloneDeepScalarValues<T>(obj, resolveOptions(options));
}


/** Recursion core: clones an object's own keys, keeping only scalars. */
function internalCloneDeepScalarValues<T extends object>(
    obj: T,
    options: Required<CloneDeepScalarValuesOptions>,
    // Store original:clone
    antiCircularMap: WeakMap<object, any> = new WeakMap(),
    // Objects on the live recursion path, used to tell a true cycle from a merely-shared reference
    ancestors: WeakSet<object> = new WeakSet(),
): ClonedDeepScalarValues<T> {

    // 1. Check if we have already cloned this specific object
    if (antiCircularMap.has(obj)) {
        return antiCircularMap.get(obj);
    }

    // 2. Prepare the container
    const safeVersion: any = Array.isArray(obj) ? [] : {};

    // 3. CRITICAL: Register the clone BEFORE recursion
    // This handles the cycle. If a child references 'obj',
    // step 1 will catch it and return 'safeVersion'.
    antiCircularMap.set(obj, safeVersion);
    ancestors.add(obj);

    try {
        const keys = Reflect.ownKeys(obj);

        for (const key of keys) {
            if (typeof key === 'string' && unsafeKeys.includes(key)) continue;
            if (options.skip_symbols && typeof key === 'symbol') continue;

            let value;
            if( options.allow_getters ) {
                // You probably don't want to do this. It's too easy for it to have side effects.
                // An example of a side effect: {get pollute() {Object.prototype.polluted = 'true'; return 'value'}}
                try {
                    // Use a try-catch block to prevent getters that throw from crashing the function
                    value = (obj as any)[key];
                } catch {
                    // If accessing the property throws (e.g., a malicious getter), skip it.
                    continue;
                }
            } else {
                const descriptor = Object.getOwnPropertyDescriptor(obj, key);

                if (!descriptor) {
                    continue;
                }

                // If the property has a getter, we treat it as unsafe and skip it.
                // We cannot safely execute a getter as it could have side effects (like prototype pollution).
                if (descriptor.get) {
                    continue;
                }

                // Now we know it's a data property, we can safely access its value.
                value = descriptor.value;
            }


            const keyAsString = String(key);

            // A boxed primitive becomes its primitive value, so it is kept as a scalar rather than cloned to {}.
            const boxed = unwrapBoxedPrimitive(value);
            if (boxed.kind === 'forged') continue;
            if (boxed.kind === 'unwrapped') value = boxed.primitive;

            if (typeof value === 'object' && value !== null) {
                // A value already on the recursion path is a true circular reference.
                if (options.skip_circular && ancestors.has(value)) continue;

                // Recurse, threading the antiCircularMap and ancestors set
                safeVersion[key] = internalCloneDeepScalarValues(
                    value,
                    options,
                    antiCircularMap,
                    ancestors,
                );
            } else if (isScalar(value)) {
                if ( shouldStripSensitiveInfo(value, options, keyAsString) ) {
                    value = simplePrivateDataReplacer(value);
                }
                safeVersion[key] = value;
            }
        }

        return safeVersion as ClonedDeepScalarValues<T>;
    } finally {
        ancestors.delete(obj);
    }
}

/** Whether a scalar value should be masked: it is a string or number, stripping is enabled, and it is not an allowed `_dangerous` property. */
function shouldStripSensitiveInfo(x: unknown, options: Required<CloneDeepScalarValuesOptions>, key?: string): boolean {
    return (typeof x === 'string' || typeof x === 'number')
        && options.strip_sensitive_info
        && !(options.allow_sensitive_in_dangerous_properties && !!key?.startsWith('_dangerous'));
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
