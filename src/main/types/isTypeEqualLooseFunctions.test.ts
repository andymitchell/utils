import isTypeEqualLooseFunctions from "./isTypeEqualLooseFunctions.ts";

describe('', () => {


    // TEST
    type a = {
        first: string,
        last?: string
    }
    type b = {
        first: string
    }


    isTypeEqualLooseFunctions<a, a>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<a, b>(true)

    test('', () => {});
})


describe('', () => {

    type c = {
        id: string,
        start: (name: string) => number
    }

    // Same shape as `c`, but a DIFFERENT function signature — proves function signatures are compared loosely.
    type cLooseFn = {
        id: string,
        start: (flag: boolean) => boolean
    }
    // Differs only by a key name (`end` vs `start`).
    type cWrongKey = {
        id: string,
        end: (name: string) => number
    }
    // Differs only by a scalar type (`id` is number, not string).
    type cWrongScalar = {
        id: number,
        start: (name: string) => number
    }


    isTypeEqualLooseFunctions<c, cLooseFn>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<c, cWrongKey>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<c, cWrongScalar>(true)

    test('', () => {});
})



describe('can nest', () => {

    type T1 = {
        id: string,
        start: (name: string) => number
    }

    type T1Upper = {
        top: number,
        a: T1
    }

    // Mirror of T1Upper with a DIFFERENT nested function signature — loose match.
    type T1UpperLooseFn = {
        top: number,
        a: {
            id: string,
            start: (flag: boolean) => boolean
        }
    }

    isTypeEqualLooseFunctions<T1Upper, T1UpperLooseFn>(true)

    test('', () => {});
})


describe('can nest deep', () => {

    type T1 = {
        id: string,
        start: (name: string) => number
    }

    type T1Upper = {
        top: number,
        a: T1
    }


    type T1UpperUpperUpper = {
        a: T1Upper
    }

    // Mirror of T1UpperUpperUpper with a DIFFERENT deeply-nested function signature — loose match.
    type T1UpperUpperLooseFn = {
        a: {
            top: number,
            a: {
                id: string,
                start: (flag: boolean) => boolean
            }
        }
    }

    isTypeEqualLooseFunctions<T1UpperUpperUpper, T1UpperUpperLooseFn>(true)


    test('', () => {});
})


