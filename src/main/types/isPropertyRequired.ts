
type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

/**
 * Helper function to test if a given record type has a property that is required. Throws type error if not. 
 * @param value 
 * @example `isPropertyRequired<{ok: boolean, name?: string}, 'ok'>(true)` OK
 * @example `isPropertyRequired<{ok: boolean, name?: string}, 'name'>(true)` Fails
 * @returns void;
 */
export default function isPropertyRequired<T, K extends keyof T>(
  _alwaysSetTrue: IsRequired<T, K> extends true ? T[K] : never
): void {
  
}

function test() {
    type Test = {ok: boolean, name?: string};
    isPropertyRequired<Test, 'ok'>(true);
    //isPropertyRequired<Test, 'name'>(true); // Will type error
}
