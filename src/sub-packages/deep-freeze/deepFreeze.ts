import type { DeepReadonly } from "./types.ts";

/**
 * Recursively makes an object and all of its nested objects immutable.
 *
 * In addition to deep freezing objects and arrays, it: 
 * 1. Leaves primitive values and functions unchanged.
 * 2. Detects and skips objects that have already been frozen to avoid infinite loops
 *    in the presence of circular references.
 *
 * @param obj - The value to freeze deeply.
 * @returns The same value, but with every object in its structure frozen.
 */
export function deepFreeze<T>(obj: T): DeepReadonly<T> {

    // If it's not an object (or is null), return it unchanged.
    if (obj === null || typeof obj !== 'object') {
        return obj as DeepReadonly<T>;
    }

    // If this object is already frozen, no further action is needed.
    if (Object.isFrozen(obj)) {
        return obj as DeepReadonly<T>;
    }

    // Freeze the current object to mark it as visited.
    Object.freeze(obj);

    // For each own property (string or symbol), apply deepFreeze.
    Reflect.ownKeys(obj).forEach(key => {
        // We need to tell TS it's okay to index with a symbol or string.
        const value = (obj as any)[key];

        // Recurse: nested objects will be frozen (or skipped if already frozen).
        deepFreeze(value);
    });

    return obj as DeepReadonly<T>;
}