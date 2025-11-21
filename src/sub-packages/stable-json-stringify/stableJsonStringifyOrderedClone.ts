import type { Options, StableJsonStringify } from "./types.ts";






/**
 * Stringify a JSON object with a deterministic key order.
 *
 * @param data - The data to stringify.
 * @param options - Configuration options.
 */
export const stableJsonStringifyOrderedClone:StableJsonStringify = (data: any, options?: Options) => {

    // Despite doing a clone, this is faster that the inline approach. 
    // Presumably because it uses the C++ native JSON.stringify rather than runtime string compilation. 

    const opts = options || {};
    const cycles = opts.serialize_circular_references === true;
    const customCmp = opts.cmp;
    
    // Track nodes to detect cycles
    const seen = new Set<any>();

    /**
     * Recursively sorts the keys of an object.
     */
    const sortObjectKeys = (node: any): any => {
        // 1. Handle .toJSON() (Standard JSON behavior)
        if (node && typeof node.toJSON === 'function') {
            node = node.toJSON();
        }

        // 2. Handle primitives and null
        if (typeof node !== 'object' || node === null) {
            return node;
        }

        // 3. Cycle Detection
        if (seen.has(node)) {
            if (cycles) return '__cycle__';
            throw new TypeError('Converting circular structure to JSON');
        }

        // Push to stack
        seen.add(node);

        try {
            // 4. Handle Arrays: Recurse into them
            if (Array.isArray(node)) {
                return node.map(sortObjectKeys);
            }

            // 5. Handle Objects: Sort keys and reconstruct
            const keys = Object.keys(node);

            if (customCmp) {
                keys.sort((a, b) => {
                    return customCmp(
                        { key: a, value: node[a] },
                        { key: b, value: node[b] }
                    );
                });
            } else {
                keys.sort();
            }

            const sortedObj: Record<string, any> = {};

            for (const key of keys) {
                // Recurse for the value
                sortedObj[key] = sortObjectKeys(node[key]);
            }

            return sortedObj;
        } finally {
            // 6. Pop from stack (Cleanup)
            seen.delete(node);
        }
    };

    const sortedFilter = sortObjectKeys(data);
    return JSON.stringify(sortedFilter);
}
