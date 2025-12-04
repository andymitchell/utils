/**
 * **Checks if the first type is a valid subset of the second type.**
 * 
 * Use this to verify that `T1` fits within the definition of `T2`.
 * It passes if `T1` is "assignable to" `T2` (e.g. `T1` is a child class of `T2`, 
 * or `T1` is a specific option within the union `T2`).
 * 
 * @example
 * // ✅ OK: 'a' is allowed in 'a' | 'b'
 * isTypeExtended<'a', 'a' | 'b'>(true);
 * 
 * @example
 * // ✅ OK: Child class extends Base class
 * isTypeExtended<ChildClass, BaseClass>(true);
 * 
 * @example
 * // ❌ Error: 'c' is not allowed in 'a' | 'b'
 * isTypeExtended<'c', 'a' | 'b'>(true);
 * 
 * @example
 * // ❌ Error: 'a' | 'c' contains 'c', which is not allowed in 'a' | 'b'
 * isTypeExtended<'a' | 'c', 'a' | 'b'>(true);
 */
export default function isTypeExtended<T1, T2>(value: [T1] extends [T2] ? true : false) {}


/*
Tests 

class A1 {
    add() {

    }
}
class A2 extends A1 {
    subtract() {

    }
}
class B1 {
    add() {

    }
}
class C1 {
    subtract() {

    }
}
isTypeExtended<A2, A1>(true); // Ok
isTypeExtended<A1, A2>(true); // Error
isTypeExtended<B1, A1>(true); // Ok
isTypeExtended<C1, A1>(true); // Error


isTypeExtended<'a', 'a' | 'b'>(true); // Ok
isTypeExtended<'a' | 'b', 'a' | 'b'>(true); // Ok
isTypeExtended<'c', 'a' | 'b'>(true); // Error
isTypeExtended<'a' | 'c', 'a' | 'b'>(true); // Error
isTypeExtended<'c', 'a' | 'b'>(true); // Error
*/