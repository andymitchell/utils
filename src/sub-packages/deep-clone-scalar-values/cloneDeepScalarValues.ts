
import { simplePrivateDataReplacer } from "./simplePrivateDataReplacer.ts";
import { isScalar, type ClonedDeepScalarValues, type Scalar } from "./types.ts";


const unsafeKeys = Object.freeze(['__proto__', 'constructor', 'prototype']);

/**
 * Creates a deeply cloned version of any input value, keeping only simple scalar values.
 *
 * This function checks if the input is a plain object or array and recursively clones it,
 * keeping only scalar values like strings, numbers, booleans, null, or undefined.
 * If the input is a single scalar (not an object/array), it is returned as-is.
 * 
 * Scalars are masked if they look potentially sensitive (e.g. token-esque) and the parameter stripSensitiveInfo is true
 *
 * @param {T} obj - The value to investigate. Can be anything.
 * @param {boolean} [stripSensitiveInfo=false] - Whether to replace sensitive scalar values.
 * @param {boolean} [allowSensitiveInDangerousProperties=false] - Allow object properties prefixed with '_dangerous' to not be stripped
 * @returns {ClonedDeepScalarValues<T>} - A deeply serialized version of the input, containing only scalar values.
 */
export function cloneDeepScalarValuesAny<T = any>(obj: T, stripSensitiveInfo?: boolean, allowSensitiveInDangerousProperties?: boolean): ClonedDeepScalarValues<T> | Scalar | undefined {
    if( Array.isArray(obj) || (typeof obj==='object' && obj!==null) ) {
        return cloneDeepScalarValues(obj, stripSensitiveInfo, allowSensitiveInDangerousProperties);
    } else {
        if( isScalar(obj) ) {
            if ( shouldStripSensitiveInfo(obj, stripSensitiveInfo, allowSensitiveInDangerousProperties) ) {
                return simplePrivateDataReplacer(obj);
            } else {
                return obj;
            }
        } else {
            return undefined;
        }
    }
}

/**
 * Recursively extracts scalar values (string, number, boolean) from an object or array.
 * 
 * This function traverses an input object or array and returns a deeply serialized version
 * where only scalar values are retained. Objects and arrays are preserved recursively, 
 * with non-scalar values stripped out. Optionally, sensitive scalar values (like strings 
 * or numbers) can be obfuscated or modified using `stripSensitiveInfo`.
 * 
 * @template T - The input object or array type.
 * @param {T} obj - The object or array to process.
 * @param {boolean} [stripSensitiveInfo=false] - Whether to replace sensitive scalar values.
 * @param {boolean} [allowSensitiveInDangerousProperties=false] - Allow properties prefixed with '_dangerous' to not be stripped
 * @returns {ClonedDeepScalarValues<T>} - A deeply serialized version of the input, containing only scalar values.
 */
export function cloneDeepScalarValues<T extends object | Array<any>>(obj: T, stripSensitiveInfo?: boolean, allowSensitiveInDangerousProperties?: boolean): ClonedDeepScalarValues<T> {


    return internalCloneDeepScalarValues<T>(obj, stripSensitiveInfo, allowSensitiveInDangerousProperties);
}


function internalCloneDeepScalarValues<T extends object>(
    obj: T,
    stripSensitiveInfo?: boolean,
    allowSensitiveInDangerousProperties?: boolean,
    // Store original:clone
    antiCircularMap: WeakMap<object, any> = new WeakMap(), 
    allowGetters = false
): ClonedDeepScalarValues<T> {

    // 1. Check if we have already cloned this specific object
    if (antiCircularMap.has(obj)) {
        return antiCircularMap.get(obj);
    }

    // 2. Prepare the container
    const safeVersion: any = Array.isArray(obj) ? [] : {};
    
    // 3. CRITICAL: Register the clone BEFORE recursion
    // This handles the cycle. If a child references 'obj', 
    // step 1 will catch it and return 'safeVersion'.
    antiCircularMap.set(obj, safeVersion);

    const keys = Reflect.ownKeys(obj);

    for (const key of keys) {
        if (typeof key === 'string' && unsafeKeys.includes(key)) continue;

        let value;
        if( allowGetters ) {
            // You probably don't want to do this. It's too easy for it to have side effects. 
            // An example of a side effect: {get pollute() {Object.prototype.polluted = 'true'; return 'value'}}
            try {
                // Use a try-catch block to prevent getters that throw from crashing the function
                value = (obj as any)[key];
            } catch {
                // If accessing the property throws (e.g., a malicious getter), skip it.
                continue;
            }
        } else {
            const descriptor = Object.getOwnPropertyDescriptor(obj, key);

            if (!descriptor) {
                continue;
            }

            // If the property has a getter, we treat it as unsafe and skip it.
            // We cannot safely execute a getter as it could have side effects (like prototype pollution).
            if (descriptor.get) {
                continue;
            }
            
            // Now we know it's a data property, we can safely access its value.
            value = descriptor.value;
        }


        const keyAsString = String(key); 

        if (typeof value === 'object' && value !== null) {
            // Recurse passing the antiCircularMap
            safeVersion[key] = internalCloneDeepScalarValues(
                value, 
                stripSensitiveInfo, 
                allowSensitiveInDangerousProperties, 
                antiCircularMap, 
                allowGetters
            );
        } else if (isScalar(value)) {
            if ( shouldStripSensitiveInfo(value, stripSensitiveInfo, allowSensitiveInDangerousProperties, keyAsString) ) {
                value = simplePrivateDataReplacer(value);
            }
            safeVersion[key] = value;
        }
    }

    return safeVersion as ClonedDeepScalarValues<T>;
}

function shouldStripSensitiveInfo(x: unknown, stripSensitiveInfo?: boolean, allowSensitiveInDangerousProperties?: boolean, key?: string) {
    return (typeof x === 'string' || typeof x === 'number') && stripSensitiveInfo && !(allowSensitiveInDangerousProperties && key?.startsWith('_dangerous'))
}

