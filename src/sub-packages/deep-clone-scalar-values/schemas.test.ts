import { describe, it, expect } from 'vitest';
import { JsonValueSchema } from './schemas.ts';
import type { JsonValue } from './types.ts';

/**
 * Anti-regression lock-down for `JsonValueSchema`.
 *
 * Intent: the schema must accept exactly the JSON value space — scalars, arrays,
 * and string-keyed objects, recursively — and reject anything with no JSON
 * representation. These are behavioural invariants that must survive the Zod 4
 * migration unchanged, so the assertions are about outcomes (accept/reject/value),
 * never about Zod's error message text.
 */
describe('JsonValueSchema', () => {
    describe('accepts the full JSON value space', () => {
        it('accepts every scalar kind', () => {
            for (const scalar of ['hello', '', 0, 3.14, -42, true, false, null]) {
                expect(JsonValueSchema.safeParse(scalar).success).toBe(true);
            }
        });

        it('accepts arrays, including nested and mixed-type', () => {
            const value = [1, 'two', false, null, [3, [4, ['five']]]];
            const result = JsonValueSchema.safeParse(value);
            expect(result.success).toBe(true);
            if (result.success) expect(result.data).toEqual(value);
        });

        it('accepts string-keyed objects', () => {
            const value = { a: 1, b: 'two', c: false, d: null };
            const result = JsonValueSchema.safeParse(value);
            expect(result.success).toBe(true);
            if (result.success) expect(result.data).toEqual(value);
        });

        it('accepts a deeply recursive mix of arrays and objects', () => {
            const value = {
                level1: { items: [{ level3: [null, { deep: 'value' }] }], count: 1 },
                list: [[[{ x: true }]]],
            };
            expect(JsonValueSchema.safeParse(value).success).toBe(true);
        });
    });

    describe('rejects values with no JSON representation', () => {
        it.each<[string, unknown]>([
            ['undefined', undefined],
            ['a function', () => 'nope'],
            ['a symbol', Symbol('s')],
            ['a bigint', 10n],
        ])('rejects %s', (_label, value) => {
            expect(JsonValueSchema.safeParse(value).success).toBe(false);
        });

        it('rejects a container that nests a non-JSON value', () => {
            expect(JsonValueSchema.safeParse({ ok: 1, bad: () => 'nope' }).success).toBe(false);
            expect(JsonValueSchema.safeParse([1, 2, undefined]).success).toBe(false);
            expect(JsonValueSchema.safeParse({ deep: { deeper: [10n] } }).success).toBe(false);
        });
    });

    describe('parsing preserves the value (metamorphic)', () => {
        it('returns a value deep-equal to the input for any valid JSON value', () => {
            const inputs: JsonValue[] = [
                'str', 42, true, null,
                [1, 2, 3],
                { a: { b: { c: [1, { d: 'e' }] } } },
                [{ k: 'v' }, [null, false]],
            ];
            for (const input of inputs) {
                const result = JsonValueSchema.safeParse(input);
                expect(result.success).toBe(true);
                if (result.success) expect(result.data).toEqual(input);
            }
        });
    });
});
