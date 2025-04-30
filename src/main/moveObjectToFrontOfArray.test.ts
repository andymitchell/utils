import { describe, it, expect } from 'vitest';
import { moveObjectToFront, moveObjectToFrontMutate } from './moveObjectToFrontOfArray.ts';

testMoveObjectToFront('moveObjectToFront', moveObjectToFront, false);
testMoveObjectToFront('moveObjectToFrontMutate', moveObjectToFrontMutate, true);


/**
 * Reusable test suite for any implementation of moveObjectToFront.
 * 
 * @param name - Name of the implementation being tested.
 * @param moveFn - The function implementation to test.
 * @param mutate - Whether the function mutates the original array.
 */
export function testMoveObjectToFront(
    name: string,
    moveFn: <T, K extends keyof T>(arr: T[], key: K, value: T[K]) => T[],
    mutate: boolean
) {
    describe(name, () => {
        it('moves matching item to front (single match)', () => {
            const arr = [
                { id: 'b' },
                { id: 'a' },
                { id: 'c' }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'id', 'a');
            expect(result[0]!.id).toBe('a');
            if (!mutate) expect(arr).toEqual(original);
        });

        it('it does not sort other keys', () => {
            const arr = [
                { id: 'z' },
                { id: 'a' },
                { id: 'y' }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'id', 'a');
            expect(result[0]!.id).toBe('a');
            expect(result[1]!.id).toBe('z');
            expect(result[2]!.id).toBe('y');
            if (!mutate) expect(arr).toEqual(original);
        });

        it('moves multiple matches to the front in order', () => {
            const arr = [
                { id: 'x' },
                { id: 'a' },
                { id: 'b' },
                { id: 'a' },
                { id: 'c' }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'id', 'a');
            expect(result.slice(0, 2).map(obj => obj.id)).toEqual(['a', 'a']);
            expect(result.length).toBe(5);
            if (!mutate) expect(arr).toEqual(original);
        });

        it('leaves array unchanged if value not found', () => {
            const arr = [
                { id: 'x' },
                { id: 'y' },
                { id: 'z' }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'id', 'a');
            expect(result).toEqual(arr);
            if (!mutate) expect(arr).toEqual(original);
        });

        it('works with numeric keys and values', () => {
            const arr = [
                { rank: 2 },
                { rank: 1 },
                { rank: 3 },
                { rank: 1 }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'rank', 1);
            expect(result.slice(0, 2).map(o => o.rank)).toEqual([1, 1]);
            if (!mutate) expect(arr).toEqual(original);
        });

        it('returns empty array if input is empty', () => {
            const arr: { id: string }[] = [];
            const result = moveFn(arr, 'id', 'a');
            expect(result).toEqual([]);
        });

        it('double check mutation', () => {
            const arr = [
                { id: 'b' },
                { id: 'a' },
                { id: 'c' }
            ];
            const original = [...arr];
            const result = moveFn(arr, 'id', 'a');
            if (!mutate) expect(arr).toEqual(original);
            if( mutate ) {
                expect(result).toBe(arr);
                expect(result).not.toBe(original);
            }
        });
    });
}
