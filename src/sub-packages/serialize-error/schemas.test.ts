import { describe, it, expect } from 'vitest';
import { SerializableErrorSchema, SerializableCommonErrorSchema } from './schemas.ts';
import { serializeError } from './serializeError.ts';
import type { SerializableError } from './types.ts';

/**
 * Anti-regression lock-down for the serialize-error schemas.
 *
 * Intent: pin the structural contract these recursive (`z.lazy`) schemas express —
 * the required `message`, the `type` enum, the optional recursive `cause` chain, and
 * that they validate the real output of `serializeError`. These invariants must
 * survive the Zod 4 migration; assertions are outcome-based, never on message text.
 */
describe('SerializableErrorSchema', () => {
    it('accepts a fully-populated serialized error', () => {
        const value: SerializableError = {
            message: 'boom',
            name: 'TypeError',
            stack: 'TypeError: boom\n  at somewhere',
            type: 'Error',
            cause_raw: { detail: [1, 2, 'three'], nested: { ok: true } },
            raw: 'original thrown value',
            internal_error: { message: 'serialize failed', cause: 'best-effort' },
        };
        expect(SerializableErrorSchema.safeParse(value).success).toBe(true);
    });

    it('accepts and preserves a nested cause chain (depth >= 2)', () => {
        const value: SerializableError = {
            message: 'top',
            type: 'Error',
            cause: {
                message: 'middle',
                type: 'object',
                cause: { message: 'root', type: 'string' },
            },
        };
        const result = SerializableErrorSchema.safeParse(value);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.cause?.cause?.message).toBe('root');
    });

    it('enforces the error-type enum', () => {
        const validTypes = [
            'Error', 'undefined', 'null', 'string', 'number',
            'boolean', 'object', 'other', 'internal-error',
        ] as const;
        for (const type of validTypes) {
            expect(SerializableErrorSchema.safeParse({ message: 'm', type }).success).toBe(true);
        }
        expect(SerializableErrorSchema.safeParse({ message: 'm', type: 'not-a-real-type' }).success).toBe(false);
    });

    it('requires the discriminating `type` field', () => {
        expect(SerializableErrorSchema.safeParse({ message: 'no type here' }).success).toBe(false);
    });

    it('requires `message` to be a string', () => {
        expect(SerializableErrorSchema.safeParse({ message: 123, type: 'Error' }).success).toBe(false);
    });
});

describe('SerializableCommonErrorSchema', () => {
    it('accepts a value that omits `type` (the common variant has no discriminator)', () => {
        expect(SerializableCommonErrorSchema.safeParse({ message: 'no type needed' }).success).toBe(true);
    });

    it('still requires a string `message`', () => {
        expect(SerializableCommonErrorSchema.safeParse({}).success).toBe(false);
    });
});

describe('the schemas validate real serializeError output (metamorphic)', () => {
    it('accepts serializeError output for an Error with a multi-level cause chain', () => {
        const root = new Error('root cause');
        const middle = new Error('middle', { cause: root });
        const top = new Error('top', { cause: middle });

        const result = SerializableErrorSchema.safeParse(serializeError(top));
        expect(result.success).toBe(true);
    });

    it('accepts serializeError output for non-Error throws', () => {
        for (const thrown of ['a string', 42, true, null, { weird: 'object' }]) {
            const result = SerializableErrorSchema.safeParse(serializeError(thrown));
            expect(result.success).toBe(true);
        }
    });
});
