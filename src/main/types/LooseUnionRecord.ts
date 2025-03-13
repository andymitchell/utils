
/**
 * Converts a discriminated union record into a single record where all possible properties are optional.
 *
 * This ensures properties remain visible in TypeScript when `strictNullChecks` is disabled (otherwise, properties not present in every union member are ignored; i.e. there will be type errors if you try to access them)
 */
export type LooseUnionRecord<T> = {
    [K in RequiredKeys<T>]-?: T extends Record<K, any> ? T[K] : never;
  } & {
    [K in Exclude<AllKeys<T>, RequiredKeys<T>>]?: T extends Record<K, any> ? T[K] : undefined;
  };


type AllKeys<T> = T extends any ? keyof T : never;

type RequiredKeys<T> = {
  [K in AllKeys<T>]: [T] extends [Record<K, any>] ? K : never
}[AllKeys<T>];


/**
 * Converts a discriminated union record into a single record where all possible properties are optional.
 *
 * This ensures properties remain visible in TypeScript when `strictNullChecks` is disabled (otherwise, properties not present in every union member are ignored; i.e. there will be type errors if you try to access them)
 * @param obj The object to infer the type of
 * @returns obj typed as the LooseUnionRecord version
 */
export function loosenUnionRecordType<T extends Record<string, any>>(obj:T):LooseUnionRecord<T> {
    return obj as unknown as LooseUnionRecord<T>;
}


