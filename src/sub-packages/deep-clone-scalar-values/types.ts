/*import { z } from "zod";

const ScalarSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
]);
export const AnyScalarSchema = ScalarSchema;
type Scalar = z.infer<typeof AnyScalarSchema>;
*/

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
 * Alias of ClonedDeepScalarValues
 */
export type DeepSerializable<T> = ClonedDeepScalarValues<T>;