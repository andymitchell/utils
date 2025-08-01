import { z } from "zod";
import { isTypeEqual } from "../../index-browser.ts";
import type { SerializableCommonError } from './types.ts';
import { JsonValueSchema } from "../deep-clone-scalar-values/schemas.ts";


export const SerializableCommonErrorSchema = z.object({
    message: z.string(),
    cause: JsonValueSchema.optional(),
    stack: z.string().optional(),
    name: z.string().optional(),
});

isTypeEqual<z.infer<typeof SerializableCommonErrorSchema>, SerializableCommonError>(true);