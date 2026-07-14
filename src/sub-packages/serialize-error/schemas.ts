import { z } from "zod";
import { isTypeEqual } from "../../index-browser.ts";
import type { ForeignSerializedError, LaxSerializableCause, LaxSerializableCommonError, SerializableCommonError, SerializableError } from './types.ts';
import { JsonValueSchema } from "@andymitchell/clone-to-json-safe";

const SerializableErrorTypeSchema = z.enum([
    'Error', 'undefined', 'null', 'string', 'number',
    'boolean', 'object', 'other', 'internal-error',
]);

const InternalErrorSchema = z.object({
    message: z.string(),
    cause: z.unknown().optional(),
});

/** The fields every serialized error carries except its cause — spread into each schema, so neither redeclares them. */
const serializableErrorCoreShape = {
    message: z.string(),
    cause_raw: JsonValueSchema.optional(),
    stack: z.string().optional(),
    name: z.string().optional(),
    raw: z.unknown().optional(),
    internal_error: InternalErrorSchema.optional(),
};

export const SerializableErrorSchema: z.ZodType<SerializableError> = z.lazy(() =>
    z.object({
        ...serializableErrorCoreShape,
        cause: SerializableErrorSchema.optional(),
        type: SerializableErrorTypeSchema,
    }),
);

export const SerializableCommonErrorSchema: z.ZodType<SerializableCommonError> = z.lazy(() =>
    z.object({
        ...serializableErrorCoreShape,
        cause: SerializableErrorSchema.optional(),
    }),
);

/** A JSON record that must carry a `message` — the shape of a cause serialized by someone other than this library. */
export const ForeignSerializedErrorSchema = z.object({ message: z.string() }).catchall(JsonValueSchema);

/** This serializer's own output first, so a cause it produced keeps its exact shape; a foreign one is the fallback. */
export const LaxSerializableCauseSchema: z.ZodType<LaxSerializableCause> = z.union([SerializableErrorSchema, ForeignSerializedErrorSchema]);

export const LaxSerializableCommonErrorSchema: z.ZodType<LaxSerializableCommonError> = z.lazy(() =>
    z.object({
        ...serializableErrorCoreShape,
        cause: LaxSerializableCauseSchema.optional(),
    }),
);

isTypeEqual<z.infer<typeof SerializableCommonErrorSchema>, SerializableCommonError>(true);
isTypeEqual<z.infer<typeof SerializableErrorSchema>, SerializableError>(true);
isTypeEqual<z.infer<typeof ForeignSerializedErrorSchema>, ForeignSerializedError>(true);
isTypeEqual<z.infer<typeof LaxSerializableCauseSchema>, LaxSerializableCause>(true);
isTypeEqual<z.infer<typeof LaxSerializableCommonErrorSchema>, LaxSerializableCommonError>(true);