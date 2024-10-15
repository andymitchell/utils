

type ValidateKeys<T, AllKeys extends string> = 
    [AllKeys] extends [keyof T] ? true : never;



/**
 * Confirm that the map type has keys. 
 * It will type error if not. 
 * 
 * Usage: 
 * typeHasKeys<(the map/object type with keys), (string union of keys)>(true)
 * 
 * @param arg Must be true
 * @example typeHasKeys<{k1: 'a', k2: 'b'}, 'k1' | 'k2'>(true) // OK
 * @example typeHasKeys<{k1: 'a'}, 'k1' | 'k2'>(true) // Errors (no 'k2' on type)
 */
export default function typeHasKeys<T, AllKeys extends string>(arg: ValidateKeys<T, AllKeys>) {
    
}

/*
// Test
type ExpectedKeys = 'k1' | 'k2';
type Obj1 = {k1: 'a', k2: 'b'};
typeHasKeys<Obj1, ExpectedKeys>(true); // OK
type Obj2 = {k1: 'a'};
typeHasKeys<Obj2, ExpectedKeys>(true); // Errors as Obj2 misses 'k2'
*/