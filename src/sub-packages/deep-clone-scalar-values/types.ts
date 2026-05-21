import { isTypeEqual } from "../../index-browser.ts";

export function isScalar(x: unknown): x is Scalar {
    return x===null || typeof x==='number' || typeof x==='boolean' || typeof x==='string';
}

export type Scalar = string | number | boolean | null;

/**
 * A serializable version of an existing type. 
 */
export type ClonedDeepScalarValues<T> = T extends Function
    ? never
    : T extends Scalar
    ? T
    : T extends Array<infer U>
    ? Array<ClonedDeepScalarValues<U>>
    : T extends object
    ? { [K in keyof T]: ClonedDeepScalarValues<T[K]> }
    : never;


/**
 * Options for `cloneDeepScalarValues` / `cloneDeepScalarValuesAny`.
 * Every field is optional and defaults to `false`.
 */
export type CloneDeepScalarValuesOptions = {
    /** Mask sensitive-looking scalar values such as tokens, emails and long digit sequences. @default false */
    strip_sensitive_info?: boolean;
    /** When `strip_sensitive_info` is on, leave values of properties whose key starts with `_dangerous` unmasked. @default false */
    allow_sensitive_in_dangerous_properties?: boolean;
    /** Omit a property whose value points back to one of its own ancestors, instead of recreating the cycle in the clone. @default false */
    skip_circular?: boolean;
    /** Omit Symbol-keyed properties from the clone. Symbol keys have no JSON representation. @default false */
    skip_symbols?: boolean;
    /** Read property values defined by getters. Getters can execute arbitrary code with side effects, so they are skipped by default; a getter that throws is always skipped. @default false */
    allow_getters?: boolean;
};


/**
 * A serializable representation of any value.
 *
 */
export type JsonValue =
  | Scalar
  | JsonValue[]
  | { [key: string]: JsonValue };





/**
 * A version of `JsonValue` with its recursive depth capped.
 */
export type JsonValueCapped<D extends number = 6> = D extends 0
  ? Scalar
  :
      | Scalar
      | JsonValueCapped<Decrement<D>>[]
      | { [key: string]: JsonValueCapped<Decrement<D>> };
type Decrement<N extends number> = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...number[]][N];
isTypeEqual<JsonValueCapped, JsonValue>(true);


/**
 * Alias of ClonedDeepScalarValues
 */
export type DeepSerializable<T> = ClonedDeepScalarValues<T>;