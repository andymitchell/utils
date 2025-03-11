
import { simplePrivateDataReplacer } from "./simplePrivateDataReplacer.ts";
import { isScalar, type ClonedDeepScalarValues } from "./types.ts";



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


    let safeVersion: Partial<T> = {};

    const keys = Reflect.ownKeys(obj); // This gets all property keys, including non-enumerable and symbol properties (the only way to get 'message' on an Error)

    function isKeyOfT(x: unknown): x is keyof T {
        return typeof x === 'string';
    }

    for (const key of keys) {
        if (isKeyOfT(key) && typeof key === 'string') {
            if (obj.hasOwnProperty(key)) {
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
