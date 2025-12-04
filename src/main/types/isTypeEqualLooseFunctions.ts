
/**
 * 1. NORMALIZE
 * Converts a Type T into a "Shape". 
 * - If property is a function, it becomes the literal string 'FUNCTION'.
 * - If property is a primitive/object, it stays as is.
 */
type ToShape<T> = {
    [K in keyof T]: NonNullable<T[K]> extends (...args: any[]) => any
        ? 'FUNCTION'
        : T[K]; // Keep the original type for non-functions
};

/**
 * 2. COMPARE
 * Checks if the Shapes of T1 and T2 are identical.
 * This effectively checks:
 * - Are all keys the same?
 * - Are all primitives/objects compatible?
 * - Is a property a function in T1 ALSO a function in T2?
 */
type AreShapesEqual<T1, T2> = 
    ToShape<Required<T1>> extends ToShape<Required<T2>>
        ? (ToShape<Required<T2>> extends ToShape<Required<T1>> ? true : false)
        : false;

/**
 * 
 * Validates that two types share the same structure (keys) and primitive types (strings, numbers),
 * but **ignores function signatures**. 
 * 
 * Any function in `S` matches any function in `I`, regardless of arguments or return types.
 * 
 * Use Case: 
 * Ideal for comparing a Zod Schema against a TypeScript Interface when the Schema
 * defines methods broadly (e.g., `z.function()`) but the Interface defines specific arguments.
 * 
 * @example
 * // ✅ Pass: Primitives match, 'method' is a function in both
 * type A = { id: string, method: () => void };
 * type B = { id: string, method: (arg: string) => number };
 * isTypeEqualShape<A, B>(true);
 * 
 * @example
 * // ❌ Fail: Primitives mismatch
 * type A = { id: string };
 * type B = { id: number };
 * isTypeEqualShape<A, B>(true); // Error
 * 
 * @example
 * // ❌ Fail: Structural mismatch (function vs string)
 * type A = { method: () => void };
 * type B = { method: string };
 * isTypeEqualShape<A, B>(true); // Error
 */
export default function isTypeEqualLooseFunctions<S, I>(
    isValid: AreShapesEqual<S, I> extends true ? true : never
): void {
    // Runtime no-op
}

