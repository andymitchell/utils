import isTypeEqual, { isTypeEqualStrictOptionality } from "./isTypeEqual.ts";


// ✅ Pass: Value types match, ignoring that 'a' is optional in T1
type te1T1 = { a?: string };
type te1T2 = { a: string };
isTypeEqual<te1T1, te1T2>(true);

// ❌ Fail: Value types diverge
type te2T1 = { a: string };
type te2T2 = { a: number };
// @ts-expect-error
isTypeEqual<te2T1, te2T2>(true); // Error


type T1 = { a: string };
type T2 = { a: string };
isTypeEqualStrictOptionality<T1, T2>(true);

// ❌ Fail: One is optional, one is required
type bT1 = { a?: string };
type bT2 = { a: string };
// @ts-expect-error
isTypeEqualStrictOptionality<bT1, bT2>(true); 

test('', () => {});