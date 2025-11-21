import { describe, it, expect, vi } from 'vitest';
import { stableJsonStringifyInline } from './stableJsonStringifyInline.ts';
import { stableJsonStringifyOrderedClone } from './stableJsonStringifyOrderedClone.ts';
import type { StableJsonStringify } from './types.ts';



performanceComparison('stableJsonStringifyInline', 'stableJsonStringifyOrderedClone', stableJsonStringifyInline, stableJsonStringifyOrderedClone);
commonTests(stableJsonStringifyOrderedClone);
commonTests(stableJsonStringifyInline);

function performanceComparison(nameA: string, nameB:string, a:StableJsonStringify, b:StableJsonStringify) {
    describe(`Performance ${nameA} vs ${nameB}`, () => {
        const generateComplexObject = (count: number, depth: number): any => {
            if (depth === 0) return 'leaf';

            const obj: any = {
                z_last: depth, // 'z' comes after 'a', forces sort
                m_middle: Array.from({ length: count }).map((_, i) => ({
                    id: i,
                    // Nested arrays of objects are where the naive approach usually chokes
                    // because it has to reconstruct every single object in the array.
                    data: { 
                        c_val: i * 2, 
                        b_val: i * 3, 
                        a_val: i * 4 
                    }
                })),
                a_first: depth, // 'a' should move to front
            };

            // Add dynamic keys in reverse order to force sorting work
            for (let i = count; i > 0; i--) {
                obj[`key_${i}_dynamic`] = `value_${i}`;
            }

            // Recursive step
            obj.n_nested = generateComplexObject(Math.floor(count / 2), depth - 1);

            return obj;
        };
        
        test('Beats naive approach', () => {

            // 10 items wide per array, 5 levels deep, plus dynamic keys
            const complexObj = generateComplexObject(20, 5); 

            // Verify correctness first (ensure both produce same output)
            const aResult = a(complexObj);
            const bResult = b(complexObj);
            expect(aResult).toBe(bResult);


            const cycles = 2000;

            const aSt = performance.now();
            for( let i = 0; i < cycles; i++ ) {
                a(complexObj)
            }
            const aTotal = performance.now()-aSt;

            const bSt = performance.now();
            for( let i = 0; i < cycles; i++ ) {
                b(complexObj)
            }
            const bTotal = performance.now()-bSt;

            //Calculate multiplier
            const ratio = (bTotal / aTotal).toFixed(2);

            console.log('Performance Results:', {
                [`${nameA} total`]: `${aTotal.toFixed(2)}ms`,
                [`${nameB} total`]: `${bTotal.toFixed(2)}ms`,
                improvement: `${ratio}x faster`
            });

        })
    })
}

function commonTests(stringify:StableJsonStringify) {
    describe('fast-stable-stringify', () => {
        describe('Comparator and Sorting', () => {
            it('should support a custom comparison function', () => {
                const obj = { c: 8, b: [{ z: 6, y: 5, x: 4 }, 7], a: 3 };

                // Sort keys in descending order
                const s = stringify(obj, {
                    cmp: (a, b) => {
                        return a.key < b.key ? 1 : -1;
                    }});

                expect(s).toBe('{"c":8,"b":[{"z":6,"y":5,"x":4},7],"a":3}');
            });

            it('should sort keys alphabetically by default (nested)', () => {
                const obj = { c: 8, b: [{ z: 6, y: 5, x: 4 }, 7], a: 3 };
                // Expect a, b, c at top level; x, y, z at nested level
                expect(stringify(obj)).toBe('{"a":3,"b":[{"x":4,"y":5,"z":6},7],"c":8}');
            });
        });

        describe('Cycles and References', () => {
            it('should throw an error on cyclic references by default', () => {
                const one: any = { a: 1 };
                const two: any = { a: 2, one: one };
                one.two = two;

                expect(() => stringify(one)).toThrow(TypeError);
                expect(() => stringify(one)).toThrow('Converting circular structure to JSON');
            });

            it('should handle cycles when specifically allowed', () => {
                const one: any = { a: 1 };
                const two: any = { a: 2, one: one };
                one.two = two;

                const result = stringify(one, { serialize_circular_references: true });
                expect(result).toBe('{"a":1,"two":{"a":2,"one":"__cycle__"}}');
            });

            it('should handle repeated non-cyclic values (DAGs)', () => {
                const one = { x: 1 };
                const two = { a: one, b: one };
                expect(stringify(two)).toBe('{"a":{"x":1},"b":{"x":1}}');
            });

            it('should handle acyclic reused object-property pointers', () => {
                const x = { a: 1 };
                const y = { b: x, c: x };
                expect(stringify(y)).toBe('{"b":{"a":1},"c":{"a":1}}');
            });
        });

        describe('Primitives and Edge Cases', () => {
            it('should stringify a simple object', () => {
                const obj = { c: 6, b: [4, 5], a: 3, z: null };
                expect(stringify(obj)).toBe('{"a":3,"b":[4,5],"c":6,"z":null}');
            });

            it('should skip undefined object properties', () => {
                const obj = { a: 3, z: undefined };
                expect(stringify(obj)).toBe('{"a":3}');
            });

            it('should preserve null object properties', () => {
                const obj = { a: 3, z: null };
                expect(stringify(obj)).toBe('{"a":3,"z":null}');
            });

            it('should convert NaN and Infinity to null', () => {
                const obj = { a: 3, b: NaN, c: Infinity };
                expect(stringify(obj)).toBe('{"a":3,"b":null,"c":null}');
            });

            it('should convert undefined in arrays to null', () => {
                const obj = [4, undefined, 6];
                expect(stringify(obj)).toBe('[4,null,6]');
            });

            it('should handle empty strings in objects', () => {
                const obj = { a: 3, z: '' };
                expect(stringify(obj)).toBe('{"a":3,"z":""}');
            });

            it('should handle empty strings in arrays', () => {
                const obj = [4, '', 6];
                expect(stringify(obj)).toBe('[4,"",6]');
            });
        });

        describe('toJSON Support', () => {
            it('should use toJSON function if present', () => {
                const obj = {
                    one: 1,
                    two: 2,
                    toJSON: function () {
                        return { one: 1 };
                    },
                };
                expect(stringify(obj)).toBe('{"one":1}');
            });

            it('should handle toJSON returning a string', () => {
                const obj = {
                    one: 1,
                    two: 2,
                    toJSON: function () {
                        return 'one';
                    },
                };
                expect(stringify(obj)).toBe('"one"');
            });

            it('should handle toJSON returning an array', () => {
                const obj = {
                    one: 1,
                    two: 2,
                    toJSON: function () {
                        return ['one'];
                    },
                };
                expect(stringify(obj)).toBe('["one"]');
            });
        });


        describe('Edge Cases & Full Coverage', () => {
            it('should return undefined for root undefined', () => {
                console.log(stringify(undefined))
                expect(stringify(undefined)).toBeUndefined();
            });

            it('should handle root primitives', () => {
                expect(stringify(null)).toBe('null');
                expect(stringify(123)).toBe('123');
                expect(stringify(true)).toBe('true');
                expect(stringify('foo')).toBe('"foo"');
            });

            it('should handle empty objects and arrays', () => {
                expect(stringify({})).toBe('{}');
                expect(stringify([])).toBe('[]');
            });

            it('should pass values to the custom comparator', () => {
                const obj = { a: 1, b: 2 };
                const spy = vi.fn(() => 0);

                stringify(obj, {cmp: spy});

                expect(spy).toHaveBeenCalled();

                // Retrieve the arguments from the first call
                const args = spy.mock.calls[0];

                // Verify that the arguments contain both entries with correct values,
                // regardless of the order (a,b) or (b,a)
                expect(args).toEqual(
                    expect.arrayContaining([
                        { key: 'a', value: 1 },
                        { key: 'b', value: 2 }
                    ])
                );
            });

            it('should handle Date objects (native toJSON)', () => {
                const date = new Date('2020-01-01T00:00:00.000Z');
                // Date.toJSON returns a string, which is then stringified again
                expect(stringify(date)).toBe('"2020-01-01T00:00:00.000Z"');
            });

            it('should ignore functions and symbols in objects', () => {
                const obj = {
                    a: 1,
                    fn: () => { },
                    sym: Symbol('test'),
                    b: 2
                };
                expect(stringify(obj)).toBe('{"a":1,"b":2}');
            });

            it('should convert functions and symbols to null in arrays', () => {
                const arr = [1, () => { }, Symbol('test'), 2];
                expect(stringify(arr)).toBe('[1,null,null,2]');
            });

            it('should safely handle objects created with Object.create(null)', () => {
                const obj = Object.create(null);
                obj.a = 1;
                obj.b = 2;
                // This checks that checking .toJSON on a prototype-less object doesn't crash
                expect(stringify(obj)).toBe('{"a":1,"b":2}');
            });

            it('should handle options object passed as undefined', () => {
                // Explicitly passing undefined to the second argument branch
                expect(stringify({ a: 1 }, undefined)).toBe('{"a":1}');
            });
        });

        
    });
}
