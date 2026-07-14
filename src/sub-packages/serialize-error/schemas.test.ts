import { describe, it, expect, expectTypeOf } from 'vitest';
import { ForeignSerializedErrorSchema, LaxSerializableCommonErrorSchema, SerializableErrorSchema, SerializableCommonErrorSchema } from './schemas.ts';
import { serializeError } from './serializeError.ts';
import type { LaxSerializableCommonError, SerializableCommonError, SerializableError } from './types.ts';

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

describe('LaxSerializableCommonErrorSchema', () => {
    it('accepts everything the strict variant produces, so widening to it loses nothing', () => {
        expectTypeOf<SerializableCommonError>().toExtend<LaxSerializableCommonError>();
        expectTypeOf<SerializableError>().toExtend<LaxSerializableCommonError>();

        const root = new Error('root cause');
        const own = serializeError(new Error('top', { cause: root }));
        expect(SerializableErrorSchema.safeParse(own).success).toBe(true);
        expect(LaxSerializableCommonErrorSchema.safeParse(own).success).toBe(true);
    });

    it('accepts a cause another producer serialized, which the strict variant rejects', () => {
        const foreignCauses = [
            { name: 'FetchError', message: 'socket hang up', stack: 'FetchError: socket hang up\n  at fetch' },
            { message: 'field is required', type: 'ValidationError', field: 'email' },
            { message: 'bare, and nothing more' },
            { message: 'arbitrarily deep detail', context: { attempt: 3, retryable: true, hosts: ['a', 'b'] } },
        ];

        for (const cause of foreignCauses) {
            const error = { message: 'refresh failed', name: 'AuthError', cause };
            expect(SerializableCommonErrorSchema.safeParse(error).success, JSON.stringify(cause)).toBe(false);
            expect(LaxSerializableCommonErrorSchema.safeParse(error).success, JSON.stringify(cause)).toBe(true);
        }
    });

    it('preserves the foreign detail it accepted, rather than stripping the error down to a message', () => {
        const error = { message: 'refresh failed', cause: { name: 'FetchError', message: 'socket hang up', code: 'ECONNRESET' } };

        const result = LaxSerializableCommonErrorSchema.safeParse(error);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.cause).toEqual({ name: 'FetchError', message: 'socket hang up', code: 'ECONNRESET' });
    });

    it('still rejects a cause with no message, since a message is what makes a cause worth keeping', () => {
        const error = { message: 'refresh failed', cause: { name: 'FetchError', code: 'ECONNRESET' } };
        expect(LaxSerializableCommonErrorSchema.safeParse(error).success).toBe(false);
    });

    it('still rejects a cause carrying a value that would not survive serialization', () => {
        for (const detail of [() => 'not json', Symbol('nope'), new Map([['a', 1]])]) {
            const error = { message: 'refresh failed', cause: { message: 'inner', detail } };
            expect(LaxSerializableCommonErrorSchema.safeParse(error).success, String(detail)).toBe(false);
        }
    });

    it('still rejects a null cause, so a consumer never has to narrow one', () => {
        expect(LaxSerializableCommonErrorSchema.safeParse({ message: 'refresh failed', cause: null }).success).toBe(false);
    });

    it('still requires a string message of the error itself', () => {
        expect(LaxSerializableCommonErrorSchema.safeParse({ cause: { message: 'inner' } }).success).toBe(false);
        expect(LaxSerializableCommonErrorSchema.safeParse({ message: 123 }).success).toBe(false);
    });
});

describe('ForeignSerializedErrorSchema', () => {
    it('accepts any JSON record that carries a message', () => {
        expect(ForeignSerializedErrorSchema.safeParse({ message: 'm' }).success).toBe(true);
        expect(ForeignSerializedErrorSchema.safeParse({ message: 'm', anything: [1, null, { deep: true }] }).success).toBe(true);
    });

    it('rejects a record without a message, and one whose extra detail is not JSON', () => {
        expect(ForeignSerializedErrorSchema.safeParse({ name: 'FetchError' }).success).toBe(false);
        expect(ForeignSerializedErrorSchema.safeParse({ message: 'm', fn: () => {} }).success).toBe(false);
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
