/**
 * UTILITY TYPES
 * Checks if the set of keys in T1 is identical to the set of keys in T2.
 * Returns `true` if identical, `false` otherwise.
 */
type AreKeysEqual<T1, T2> = 
    Exclude<keyof T1, keyof T2> extends never 
    ? (Exclude<keyof T2, keyof T1> extends never ? true : false) 
    : false;

/**
 * Confirm two types have the same keys. 
 * 
 * It's a weaker version of `isTypeEquals`.
 * 
 * Example of where it's useful: 
 * The schema is intentionally less rigorous than the type (perhaps because the type is too complex to express in Zod, 
 * e.g. the schema just defines the key is `z.function()` rather than the specifics), 
 * but we still want to be warned if there's a major divergence. 
 *  
 */
export default function isTypeEqualKeys<S, I>(
    // If keys match, this expects `true`.
    // If keys mismatch, this resolves to `never`, causing a compile error when you pass `true`.
    check: AreKeysEqual<Required<S>, Required<I>> extends true ? true : never
): void {};





// TEST
type a = {
    first: string, 
    last?: string
}
type b = {
    first: string
}
isTypeEqualKeys<a, a>(true)
// @ts-expect-error
isTypeEqualKeys<a, b>(true)