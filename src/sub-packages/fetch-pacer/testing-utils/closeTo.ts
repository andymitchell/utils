/**
 * Allow a little wiggle room when working with time calculations based off of 'now'.
 * @param value 
 * @param target 
 * @param allowance 
 * @returns 
 */
export default function closeTo(value:number, target: number, allowance = 5) {
    return value>=(target-allowance) && value<=(target+allowance);
}