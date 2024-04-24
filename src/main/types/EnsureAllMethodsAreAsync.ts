


export type EnsureAllMethodsAreAsync<T, ExcludeTypes = never> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? (T[K] extends (...args: any[]) => Promise<any> ? T[K] : never)
        : T[K] extends ExcludeTypes
        ? T[K]
        : T[K];
};

export type EnsureAllMethodsAreAsyncRecursive<T, ExcludeTypes = never> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? (T[K] extends (...args: any[]) => Promise<any> ? T[K] : never)
        : T[K] extends ExcludeTypes
        ? T[K]
        : T[K] extends object
        ? EnsureAllMethodsAreAsyncRecursive<T[K], ExcludeTypes>
        : T[K];
};
