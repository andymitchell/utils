import { z } from "zod";
import isTypeEqualLooseFunctions from "./isTypeEqualLooseFunctions.ts";


// TEST
type a = {
    first: string, 
    last?: string
}
type b = {
    first: string
}
type c = {
    id: string,
    start: (name: string) => number
}

const cSchema = z.object({
    id: z.string(),
    start: z.function()
})
type cSchemaType = z.infer<typeof cSchema>
const c1Schema = z.object({
    id: z.string(),
    end: z.function()
})
type c1SchemaType = z.infer<typeof c1Schema>
const c2Schema = z.object({
    id: z.number(),
    start: z.function()
})
type c2SchemaType = z.infer<typeof c2Schema>


isTypeEqualLooseFunctions<a, a>(true)
// @ts-expect-error
isTypeEqualLooseFunctions<a, b>(true)

isTypeEqualLooseFunctions<c, cSchemaType>(true)
// @ts-expect-error
isTypeEqualLooseFunctions<c, c1SchemaType>(true)
// @ts-expect-error
isTypeEqualLooseFunctions<c, c2SchemaType>(true)

test('', () => {});