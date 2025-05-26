/**
 * Allow a little wiggle room when working with time calculations based off of 'now'.
 * @param value 
 * @param target 
 * @param allowance 
 * @returns 
 */
export function closeTo(target: number, val?:number, allowance = 5) {
    if( typeof val!=='number' ) return false;

    return val>=(target-allowance) && val<=(target+allowance);
}

/**
 * Test if between two numbers
 * @param gte 
 * @param lte 
 * @param val 
 */
export function expectBetweenNumbers(gte: number, lte: number, val?: number) {
    expect(val).toBeGreaterThanOrEqual(gte);
    expect(val).toBeLessThanOrEqual(lte);
}

export function expectCloseTo(target: number, val?: number, allowance = 5) {
    expect(val).toBeGreaterThanOrEqual(target-allowance);
    expect(val).toBeLessThanOrEqual(target+allowance);
}


/**
 * Expect that val is gte target, but lte target+allowance. 
 * @param target 
 * @param val 
 * @param allowance 
 */
export function expectBoundGreaterThan(target: number, val?: number, allowance = 5) {
    expect(val).toBeGreaterThanOrEqual(target);
    expect(val).toBeLessThanOrEqual(target+allowance);
}