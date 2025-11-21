/**
 * Represents a key-value pair passed to the custom comparator.
 */
export interface ComparatorEntry {
    key: string;
    value: any;
}

/**
 * Function to compare two entries for sorting.
 */
export type Comparator = (a: ComparatorEntry, b: ComparatorEntry) => number;

/**
 * Configuration options for the stringify function.
 */
export interface Options {
    /**
     * If true, circular references will be replaced with "__cycle__"
     * instead of throwing an error. 
     * 
     * It will no longer be an accurate string representation.
     * @default false
     */
    serialize_circular_references?: boolean;
    
    /**
     * A custom comparison function to sort keys.
     */
    cmp?: Comparator;
}

export type JsonStringifyReturnType = ReturnType<typeof JSON.stringify>;

/**
 * Stringify a JSON object with a deterministic key order.
 *
 * @param data - The data to stringify.
 * @param options - Configuration options.
 */
export type StableJsonStringify = (
    data: any,
    options?: Options
) => JsonStringifyReturnType;
