// src/deepFreeze.test.ts

import { describe, it, expect } from 'vitest';
import { deepFreeze } from './deepFreeze.ts';

describe('deepFreeze', () => {

    // =================================================================
    // 1. Core Functionality Tests
    // =================================================================
    describe('Core Functionality', () => {
        it('should freeze a simple flat object', () => {
            const obj = { a: 1, b: 'hello' };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(() => { (frozenObj as any).a = 2; }).toThrow(TypeError);
        });

        it('should freeze a deeply nested object', () => {
            const obj = {
                level1: {
                    level2: {
                        level3: 'deep value',
                        b: 42
                    },
                    c: [1, 2] // Also test array inside
                }
            };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj.level1)).toBe(true);
            expect(Object.isFrozen(frozenObj.level1.level2)).toBe(true);
            expect(Object.isFrozen(frozenObj.level1.c)).toBe(true);

            // Verify deep mutations fail
            expect(() => { (frozenObj.level1.level2 as any).b = 99; }).toThrow(TypeError);
        });

        it('should freeze arrays and the objects within them', () => {
            const arr = [{ a: 1 }, { b: 2 }];
            const frozenArr = deepFreeze(arr);

            expect(Object.isFrozen(frozenArr)).toBe(true);
            expect(Object.isFrozen(frozenArr[0])).toBe(true);
            expect(Object.isFrozen(frozenArr[1])).toBe(true);

            // Test mutation of array elements and their properties
            expect(() => { (frozenArr as any).push({ c: 3 }); }).toThrow(TypeError);
            expect(() => { (frozenArr[0] as any).a = 100; }).toThrow(TypeError);
        });

        it('should handle complex structures with nested arrays and objects', () => {
            const complex = {
                id: 'c1',
                items: [
                    { id: 'i1', tags: ['a', 'b'] },
                    { id: 'i2', metadata: { source: 'user' } }
                ]
            };
            const frozenComplex = deepFreeze(complex);

            expect(Object.isFrozen(frozenComplex.items)).toBe(true);
            expect(Object.isFrozen(frozenComplex.items[0])).toBe(true);
            expect(Object.isFrozen(frozenComplex.items[0]!.tags)).toBe(true);
            expect(Object.isFrozen(frozenComplex.items[1]!.metadata)).toBe(true);

            expect(() => { (frozenComplex.items[0]!.tags as any).push('c'); }).toThrow(TypeError);
            expect(() => { (frozenComplex.items[1]!.metadata as any).source = 'system'; }).toThrow(TypeError);
        });
    });


    // =================================================================
    // 2. Edge Case Tests
    // =================================================================
    describe('Edge Cases', () => {
        it('should correctly handle an empty object', () => {
            const obj = {};
            const frozenObj = deepFreeze(obj);
            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(() => { (frozenObj as any).newProp = 1; }).toThrow(TypeError);
        });

        it('should correctly handle an empty array', () => {
            const arr: any[] = [];
            const frozenArr = deepFreeze(arr);
            expect(Object.isFrozen(frozenArr)).toBe(true);
            // @ts-ignore
            expect(() => { frozenArr.push(1); }).toThrow(TypeError);
        });

        it('should not affect properties that are null or undefined', () => {
            const obj = { a: null, b: undefined, c: { d: 1 } };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj.c)).toBe(true);
            expect(frozenObj.a).toBeNull();
            expect(frozenObj.b).toBeUndefined();
        });

        it('should not freeze functions within an object', () => {
            const obj = {
                data: 1,
                action: () => 'hello'
            };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj.action)).toBe(false); // Functions are not frozen
            expect(frozenObj.action()).toBe('hello');
        });

        it('should freeze objects with Symbol properties', () => {
            const sym = Symbol('id');
            const obj = { [sym]: { secret: 'data' } };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj[sym])).toBe(true);
            expect(() => { (frozenObj[sym] as any).secret = 'changed'; }).toThrow(TypeError);
        });

        it('should freeze non-enumerable properties', () => {
            const obj = {};
            Object.defineProperty(obj, 'nonEnum', {
                value: { a: 1 },
                enumerable: false,
                writable: true,
                configurable: true
            });
            const frozenObj = deepFreeze(obj as any);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj.nonEnum)).toBe(true);
            expect(() => { frozenObj.nonEnum.a = 2; }).toThrow(TypeError);
        });

        it('should handle objects created with Object.create(null) (no prototype)', () => {
            const obj = Object.create(null);
            obj.a = { b: 1 };
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(Object.isFrozen(frozenObj.a)).toBe(true);
            expect(() => { frozenObj.a.b = 2; }).toThrow(TypeError);
        });
    });


    // =================================================================
    // 3. Circular Reference Tests
    // =================================================================
    describe('Circular References', () => {
        it('should not throw a stack overflow error with a direct circular reference', () => {
            const obj: any = { name: 'circular' };
            obj.self = obj;

            expect(() => deepFreeze(obj)).not.toThrow();
            const frozenObj = deepFreeze(obj);

            expect(Object.isFrozen(frozenObj)).toBe(true);
            expect(() => { frozenObj.name = 'changed'; }).toThrow(TypeError);
        });

        it('should handle complex, indirect circular references', () => {
            const a: any = { name: 'A' };
            const b: any = { name: 'B' };
            a.b = b;
            b.a = a;

            expect(() => deepFreeze(a)).not.toThrow();

            const frozenA = deepFreeze(a);
            const frozenB = frozenA.b;

            expect(Object.isFrozen(frozenA)).toBe(true);
            expect(Object.isFrozen(frozenB)).toBe(true);
            expect(frozenB.a).toBe(frozenA); // The reference is preserved

            expect(() => { frozenA.name = 'changed'; }).toThrow(TypeError);
            expect(() => { frozenB.name = 'changed'; }).toThrow(TypeError);
        });

        it('should handle circular references within arrays', () => {
            const arr: any[] = [{ id: 1 }];
            arr.push(arr); // Array contains a reference to itself

            expect(() => deepFreeze(arr)).not.toThrow();
            const frozenArr = deepFreeze(arr);

            expect(Object.isFrozen(frozenArr)).toBe(true);
            expect(Object.isFrozen(frozenArr[0])).toBe(true);
            expect(frozenArr[1]).toBe(frozenArr);
        });
    });


    // =================================================================
    // 4. Invalid and Attacking Input Tests
    // =================================================================
    describe('Invalid or Non-Object Inputs', () => {
        it('should return null when given null', () => {
            expect(deepFreeze(null as any)).toBeNull();
        });

        // Test all primitives
        it.each([
            ['a string', 'hello'],
            [123, 123],
            [true, true],
            [Symbol('test'), Symbol('test')],
            [123n, 123n],
            [undefined, undefined]
        ])(
            'should return the primitive value %s unchanged', 
            // @ts-ignore
            (value) => {
                expect(deepFreeze(value as any)).toBe(value);
            }
        );

        it('should return a function unchanged when passed directly', () => {
            const myFunc = () => { };
            expect(deepFreeze(myFunc as any)).toBe(myFunc);
            expect(Object.isFrozen(myFunc)).toBe(false);
        });
    });
});