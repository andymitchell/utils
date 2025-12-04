import { z } from "zod";
import isTypeEqualLooseFunctions from "./isTypeEqualLooseFunctions.ts";

describe('', () => {


    // TEST
    type a = {
        first: string, 
        last?: string
    }
    type b = {
        first: string
    }


    isTypeEqualLooseFunctions<a, a>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<a, b>(true)

    test('', () => {});
})


describe('', () => {

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


    isTypeEqualLooseFunctions<c, cSchemaType>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<c, c1SchemaType>(true)
    // @ts-expect-error
    isTypeEqualLooseFunctions<c, c2SchemaType>(true)

    test('', () => {});
})



describe('can nest', () => {

    type T1 = {
        id: string,
        start: (name: string) => number
    }

    type T1Upper = {
        top: number, 
        a: T1
    }

    const T1Schema = z.object({
        id: z.string(),
        start: z.function()
    })

    const T1UpperSchema = z.object({
        top: z.number(), 
        a: T1Schema
    })

    

    isTypeEqualLooseFunctions<T1Upper, z.infer<typeof T1UpperSchema>>(true)
    
    test('', () => {});
})


describe('can nest deep', () => {

    type T1 = {
        id: string,
        start: (name: string) => number
    }

    type T1Upper = {
        top: number, 
        a: T1
    }


    type T1UpperUpperUpper = {
        a: T1Upper
    }

    const T1Schema = z.object({
        id: z.string(),
        start: z.function()
    })

    const T1UpperSchema = z.object({
        top: z.number(), 
        a: T1Schema
    })


    const T1UpperUpperSchema = z.object({
        a: T1UpperSchema
    })

    

    isTypeEqualLooseFunctions<T1UpperUpperUpper, z.infer<typeof T1UpperUpperSchema>>(true)
    

    test('', () => {});
})


