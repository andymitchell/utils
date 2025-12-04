
/**
 * 1. NORMALIZE (Recursive)
 * Converts a Type T into a "Shape". 
 * - Removes optionality (treats optional fields as required).
 * - If property is a function, it becomes the literal string 'FUNCTION'.
 * - If property is an object, it recurses.
 * - If property is a primitive, it uses the NonNullable type.
 */
type ToShape<T> = {
    // -? removes the optional modifier from the key (makes deep comparison strict regarding value types)
    [K in keyof T]-?: NonNullable<T[K]> extends (...args: any[]) => any
        ? 'FUNCTION'
        : NonNullable<T[K]> extends object
            ? ToShape<NonNullable<T[K]>> // <--- RECURSION HAPPENS HERE
            : NonNullable<T[K]>;         // Primitives (string, number, boolean)
};

/**
 * 2. COMPARE
 * Checks if the Shapes of T1 and T2 are identical.
 */
type AreShapesEqual<T1, T2> = 
    ToShape<T1> extends ToShape<T2>
        ? (ToShape<T2> extends ToShape<T1> ? true : false)
        : false;

/**
 * Validates that two types share the same structure (keys) and primitive types,
 * but **ignores function signatures** deeply.
 */
export default function isTypeEqualLooseFunctions<S, I>(
    isValid: AreShapesEqual<S, I> extends true ? true : never
): void {
    // Runtime no-op
}