import { z } from "zod";

const ScalarSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
]);
export const AnyScalarSchema = ScalarSchema;
type Scalar = z.infer<typeof AnyScalarSchema>;


export type DeepSerializable<T> = T extends Function
    ? never
    : T extends Scalar
    ? T
    : T extends Array<infer U>
    ? Array<DeepSerializable<U>>
    : T extends object
    ? { [K in keyof T]: DeepSerializable<T[K]> }
    : never;
