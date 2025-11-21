import type { JsonStringifyReturnType, StableJsonStringify } from "./types.ts";

/**
 * Stringify a JSON object with a deterministic key order.
 *
 * @param data - The data to stringify.
 * @param options - Configuration options.
 */
export const stableJsonStringifyInline: StableJsonStringify = (data, options) => {
    // Inspired by https://github.com/epoberezkin/fast-json-stable-stringify, but found to be slower than ordered clone. Not recommended.

    const opts = options || {};
    const cycles = opts.serialize_circular_references === true;
    const customCmp = opts.cmp;

    // Optimization: Use Set for O(1) lookups (Original used Array.indexOf which is O(N))
    const seen = new Set<any>();

    // Define the recursive walker
    const stringify = (node: any): string | undefined => {
        // 1. Handle .toJSON() (standard JSON behavior)
        // Checking presence first is faster than try/catch or type checking blindly
        if (node && typeof node.toJSON === 'function') {
            node = node.toJSON();
        }

        // 2. Fast path for Primitives
        // We check 'object' last because it's the most expensive check
        if (node === undefined) return undefined;
        if (node === null) return 'null';
        if (typeof node === 'number') return isFinite(node) ? '' + node : 'null';
        if (typeof node === 'boolean') return node ? 'true' : 'false';
        if (typeof node !== 'object') {
             // Functions and Symbols return undefined, effectively skipping them
             if (typeof node === 'function' || typeof node === 'symbol') return undefined;
             return JSON.stringify(node);
        }

        // 3. Cycle Detection
        if (seen.has(node)) {
            if (cycles) return '"__cycle__"';
            throw new TypeError('Converting circular structure to JSON');
        }

        // 4. Add to stack (Set is O(1))
        seen.add(node);

        let out: string;
        
        if (Array.isArray(node)) {
            out = '[';
            const len = node.length;
            // Standard for loop is faster than for...of or map
            for (let i = 0; i < len; i++) {
                if (i > 0) out += ',';
                const item = stringify(node[i]);
                // JSON spec: Arrays convert undefined/function/symbol to null
                out += (item === undefined ? 'null' : item);
            }
            out += ']';
        } else {
            const keys = Object.keys(node);
            
            if (customCmp) {
                keys.sort((a, b) => customCmp(
                    { key: a, value: node[a] }, 
                    { key: b, value: node[b] }
                ));
            } else {
                keys.sort();
            }

            out = ''; // Start empty to handle comma logic efficiently
            const len = keys.length;
            let first = true;

            for (let i = 0; i < len; i++) {
                const key = keys[i]!;
                const value = stringify(node[key]);

                // Skip properties with undefined/function/symbol values
                if (value === undefined) continue;

                if (!first) {
                    out += ',';
                }
                // Manual string concatenation is faster than template literals in tight loops
                out += JSON.stringify(key) + ':' + value;
                first = false;
            }
            out = '{' + out + '}';
        }

        // 5. Remove from stack
        seen.delete(node);
        return out;
    };

    // JSON.stringify can return undefined (see `JSON.stringify(undefined)`), it just doesn't admit it in the type system. So coerce it.
    return stringify(data) as JsonStringifyReturnType;
};

