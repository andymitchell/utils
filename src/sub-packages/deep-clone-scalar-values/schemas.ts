import { z } from "zod";
import type { JsonValue, JsonValueCapped } from "./types.ts";
import { isTypeEqual } from "../../index-browser.ts";

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

isTypeEqual<z.infer<typeof JsonValueSchema>, JsonValue>(true);
isTypeEqual<z.infer<typeof JsonValueSchema>, JsonValueCapped>(true);
