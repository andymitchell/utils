import { isTypeEqual } from "../../index-browser.ts";

export function isScalar(x: unknown): x is Scalar {
    return typeof x==='number' || typeof x==='boolean' || typeof x==='string';
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