
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
    visited: WeakSet<object> = new WeakSet(), // circular reference tracking
    allowGetters = false
): ClonedDeepScalarValues<T> {

    // Handle circular references
    if (visited.has(obj)) {
        // If we've seen this object before, return undefined instead of recursing
        return undefined as any; 
    }
    // Add the current object to the set of visited objects.
    visited.add(obj);

    // Handle top-level arrays 
    const safeVersion: any = Array.isArray(obj) ? [] : {};

    const keys = Reflect.ownKeys(obj); // This gets all property keys, including non-enumerable and symbol properties

    for (const key of keys) {

        if (typeof key === 'string' && unsafeKeys.includes(key)) {
            continue; // Skip potentially malicious keys like `__proto__`
        }

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
        
        
        

        
        
        
        
        const keyAsString = String(key); // For use with string-based checks

        if (typeof value === 'object' && value !== null) {
            // Recursively call, passing the `visited` set along.
            safeVersion[key] = internalCloneDeepScalarValues(value, stripSensitiveInfo, allowSensitiveInDangerousProperties, visited);
        } else if (isScalar(value)) {
            if ( shouldStripSensitiveInfo(value, stripSensitiveInfo, allowSensitiveInDangerousProperties, keyAsString) ) {
                value = simplePrivateDataReplacer(value);
            }
            safeVersion[key] = value;
        }
        // Non-scalar, non-object values (like functions) are implicitly skipped.
    }

    return safeVersion as ClonedDeepScalarValues<T>;
}

function shouldStripSensitiveInfo(x: unknown, stripSensitiveInfo?: boolean, allowSensitiveInDangerousProperties?: boolean, key?: string) {
    return (typeof x === 'string' || typeof x === 'number') && stripSensitiveInfo && !(allowSensitiveInDangerousProperties && key?.startsWith('_dangerous'))
}

/*
export function cloneDeepScalarValues<T extends object | Array<any>>(obj: T, stripSensitiveInfo?: boolean, allowSensitiveInDangerousProperties?: boolean): ClonedDeepScalarValues<T> {


    let safeVersion: Partial<T> = {};

    const keys = Reflect.ownKeys(obj); // This gets all property keys, including non-enumerable and symbol properties (the only way to get 'message' on an Error)

    function isKeyOfT(x: unknown): x is keyof T {
        return typeof x === 'string';
    }

    

    for (const key of keys) {
        if (isKeyOfT(key) && typeof key === 'string') {
            if (obj.hasOwnProperty(key)) {
                if( unsafeKeys.includes(key) ) continue; // Skip these potentially malicious keys


                let value = obj[key];
                if (typeof value === 'object' && !!value) {
                    if (Array.isArray(value)) {
                        safeVersion[key] = value.map(x => {
                            if (isScalar(x)) return x;
                            return cloneDeepScalarValues(x, stripSensitiveInfo, allowSensitiveInDangerousProperties)
                        }) as T[typeof key];
                    } else {
                        // Object
                        safeVersion[key] = cloneDeepScalarValues(value, stripSensitiveInfo, allowSensitiveInDangerousProperties) as T[typeof key];
                    }
                } else if (isScalar(value)) {
                    if ((typeof value === 'string' || typeof value === 'number') && stripSensitiveInfo && !(allowSensitiveInDangerousProperties && key.startsWith('_dangerous'))) {
                        value = simplePrivateDataReplacer(value) as T[typeof key];
                    }
                    safeVersion[key] = value;
                }

            }
        }
    }

    return safeVersion as ClonedDeepScalarValues<T>;

}
*/