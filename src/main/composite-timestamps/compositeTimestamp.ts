import { z } from "zod";



export const CompositeTimestampSchema = z.object({
    composite: z.string(),
    time_ms: z.number(),
    index: z.number()
})
export type CompositeTimestamp = z.infer<typeof CompositeTimestampSchema>;
export function isCompositeTimestamp(x: unknown): x is CompositeTimestamp {
    return CompositeTimestampSchema.safeParse(x).success;
}
export function isNumericTimestamp(x: unknown): x is number {
    return typeof x==='number';
}

export const FlexibleTimestampSchema = z.union([
    z.number(),
    CompositeTimestampSchema
])
export type FlexibleTimestamp = z.infer<typeof FlexibleTimestampSchema>;


export function createCompositeTimestamp(timeMs:number, index: number):CompositeTimestamp {
    return {composite: `${timeMs}-${index}`, time_ms:timeMs, index};
}

export function incrementCompositeTimestampIndex(timestamp:CompositeTimestamp):CompositeTimestamp {
    return createCompositeTimestamp(timestamp.time_ms, timestamp.index+1);
}

export function sortCompositeTimestamp(a:FlexibleTimestamp, b: FlexibleTimestamp):0 | -1 | 1 {

    const timestampA = isNumericTimestamp(a)? a : a.time_ms;
    const timestampB = isNumericTimestamp(b)? b : b.time_ms;

    if( timestampA > timestampB ) {
        return 1;
    } else if( timestampA < timestampB ) {
        return -1;
    } else {
        const cA = isCompositeTimestamp(a);
        const cB = isCompositeTimestamp(b);
        if( cA && cB ) {
            if( a.index>b.index ) {
                return 1;
            } else if( a.index<b.index ) {
                return -1;
            }
        } else if( cA ) {
            if( a.index>0 ) return 1;
        } else if( cB ) {
            if( b.index>0 ) return -1;
        }
        return 0;
        
    }
    
}

/**
 * true if a is greater than b
 * @param a 
 * @param b 
 * @returns True, if a is greater than b
 */
export function gtCompositeTimestamp(a:FlexibleTimestamp, b: FlexibleTimestamp):boolean {
    return sortCompositeTimestamp(a, b)===1
}

/**
 * True if a is greater than or equal to b
 * @param a 
 * @param b 
 * @returns True, if a is greater than b
 */
export function gteCompositeTimestamp(a:FlexibleTimestamp, b: FlexibleTimestamp):boolean {
    return sortCompositeTimestamp(a, b)>=0
}