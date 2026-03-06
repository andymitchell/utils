import { z } from "zod";
import { isTypeEqual } from "../../index-browser.ts";
import type { SerializableCommonError, SerializableError } from './types.ts';
import { JsonValueSchema } from "../deep-clone-scalar-values/schemas.ts";

const SerializableErrorTypeSchema = z.enum([
    'Error', 'undefined', 'null', 'string', 'number',
    'boolean', 'object', 'other', 'internal-error',
]);

const InternalErrorSchema = z.object({
    message: z.string(),
    cause: z.unknown().optional(),
});

export const SerializableErrorSchema: z.ZodType<SerializableError> = z.lazy(() =>
    z.object({
        message: z.string(),
        cause_raw: JsonValueSchema.optional(),
        cause: SerializableErrorSchema.optional(),
        stack: z.string().optional(),
        name: z.string().optional(),
        raw: z.unknown().optional(),
        internal_error: InternalErrorSchema.optional(),
        type: SerializableErrorTypeSchema,
    }),
);

export const SerializableCommonErrorSchema: z.ZodType<SerializableCommonError> = z.lazy(() =>
    z.object({
        message: z.string(),
        cause_raw: JsonValueSchema.optional(),
        cause: SerializableErrorSchema.optional(),
        stack: z.string().optional(),
        name: z.string().optional(),
        raw: z.unknown().optional(),
        internal_error: InternalErrorSchema.optional(),
    }),
);

isTypeEqual<z.infer<typeof SerializableCommonErrorSchema>, SerializableCommonError>(true);
isTypeEqual<z.infer<typeof SerializableErrorSchema>, SerializableError>(true);