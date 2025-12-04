type EnsureBidirectionalCompatibility<T1, T2> = [T1] extends [T2] ? [T2] extends [T1] ? true : false : false;


/**
 * **Checks if types match.**
 * 
 * It treats optional fields the same as required fields.
 * Use this if you want `{ a?: string }` and `{ a: string }` to be considered equal.
 * It ignores the `?` modifier and just checks that the value types (e.g. string) are correct.
 * 
 * @example
 * // ✅ OK: Value types match (string), ignoring that one is optional.
 * isTypeEqual<{ a?: string }, { a: string }>(true);
 * 
 * @example
 * // ❌ Error: Value types mismatch (string vs number).
 * isTypeEqual<{ a: string }, { a: number }>(true);
 */
export default function isTypeEqual<T1, T2>(value: EnsureBidirectionalCompatibility<Required<T1>, Required<T2>> extends true ? true : never) {}


/**
 * **Strictly checks if types are exactly the same.**
 * 
 * Use this when you need an exact match. Unlike `isTypeEqual`, this will fail 
 * if one type has an optional field (`?`) and the other is required.
 * 
 * @example
 * // ✅ OK: Exact match.
 * isTypeEqualIgnoringPartials<{ a: string }, { a: string }>(true);
 * 
 * @example
 * // ❌ Error: One is optional, the other is required.
 * isTypeEqualIgnoringPartials<{ a?: string }, { a: string }>(true);
 */
export function isTypeEqualStrictOptionality<T1, T2>(value: EnsureBidirectionalCompatibility<T1, T2> extends true ? true : never) {}
