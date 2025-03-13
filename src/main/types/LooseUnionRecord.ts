/**
 * Converts a discriminated union record into a single record where all possible properties are optional.
 *
 * This ensures properties remain visible in TypeScript when `strictNullChecks` is disabled (otherwise, properties not present in every union member are ignored; i.e. there will be type errors if you try to access them)
 */
export type LooseUnionRecord<T> = {
    [K in T extends any ? keyof T : never]?: T extends Record<K, any> ? T[K] : undefined;
};