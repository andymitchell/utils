/**
 * @example isTypeExtended<IClass, BaseClass>(true); // The true will flag as a type error if T1 is no longer a descendant of T2
 * @example isTypeExtended<'a', 'a' | 'b'>(true); // Ok
 * @example isTypeExtended<'a' | 'b', 'a' | 'b'>(true); // Ok
 * @example isTypeExtended<'c', 'a' | 'b'>(true); // Error
 * @example isTypeExtended<'a' | 'c', 'a' | 'b'>(true); // Error
 * @example isTypeExtended<'c', 'a' | 'b'>(true); // Error
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