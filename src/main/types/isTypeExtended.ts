/**
 * @example isTypeExtended<IClass, BaseClass>(true); // The true will flag as a type error if T1 is no longer a descendant of T2
 */
export default function isTypeExtended<T1, T2>(value: [T1] extends [T2] ? true : false) {}

/**
 * 
 * @example isUnionTypeExtended<'a', 'a' | 'b'>(true); // Ok
 * @example isUnionTypeExtended<'c', 'a' | 'b'>(true); // Error
 */
export function isUnionTypeExtended<T1, T2>(value: T1 extends T2 ? true : false) {}


// Usage: isTypeExtended<IClass, BaseClass>(true); // The true will flag as a type error if T1 is no longer a descendant of T2