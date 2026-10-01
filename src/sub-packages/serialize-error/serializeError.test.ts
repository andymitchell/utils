import { describe, it, expect, vi } from 'vitest';
import { serializeError } from './serializeError.ts';
import { SerializableErrorSchema } from './schemas.ts';


describe('serializeError', () => {
    // Test case for standard Error instances
    it('should correctly serialize a standard Error object', () => {
        const error = new Error('Something went wrong');
        error.name = 'CustomError';
        error.stack = 'Error: Something went wrong\n    at <anonymous>:1:7';

        const serialized = serializeError(error);
        delete serialized.raw;

        expect(serialized).toEqual({
            message: 'Something went wrong',
            name: 'CustomError',
            stack: error.stack,
            cause: {
                message: "undefined",
                raw: undefined,
                type: "undefined"
            },
            cause_raw: {},
            type: 'Error'
        });
    });

    // Test case for an Error with a cause
    it('should correctly serialize an Error object with a cause', () => {
        const cause = new Error('The underlying reason');
        const error = new Error('Main error', { cause });

        const serialized = serializeError(error);
        delete serialized.raw;

        expect(serialized).toEqual({
            message: 'Main error',
            name: 'Error',
            stack: error.stack,
            cause: serializeError(cause),
            cause_raw: {
                message: cause.message
            },
            type: 'Error'
        });
    });

    // Test case for plain string inputs
    it('should handle plain string inputs', () => {
        const errorMessage = 'An error occurred';
        const serialized = serializeError(errorMessage);

        expect(serialized).toEqual({
            message: errorMessage,
            raw: errorMessage,
            type: 'string'
        });
    });

    // Test case for plain objects with error-like properties
    it('should extract properties from an object with error-like keys', () => {
        const errorObject = {
            message: 'Error from object',
            name: 'ObjectError',
            stack: 'stack trace',
            cause: { reason: 'some dependency failed' },
        };

        const serialized = serializeError(errorObject);
        delete serialized.raw;
        delete serialized.cause;

        expect(serialized).toEqual({
            message: 'Error from object',
            name: 'ObjectError',
            stack: 'stack trace',
            cause_raw: { reason: 'some dependency failed' },
            type: 'object'
        });
    });

    // Test case for an object without a string message
    it('should stringify an object if the message property is not a string', () => {
        const errorObject = { message: { complex: 'message' }, code: 500 };
        const serialized = serializeError(errorObject);

        expect(serialized.message).toBe(JSON.stringify(errorObject));
    });

    // Test case for circular references in objects
    it('should handle circular references in objects gracefully', () => {
        const circularObject: { a: string; b?: any } = { a: 'circular' };
        circularObject.b = circularObject;

        const serialized = serializeError(circularObject);

        expect(serialized.message).toBe('Could not serialize the error object.');
    });

    it('produces JSON-serializable output for a circular input', () => {
        const circularObject: { a: string; b?: any } = { a: 'circular' };
        circularObject.b = circularObject;

        const serialized = serializeError(circularObject);

        expect(() => JSON.stringify(serialized)).not.toThrow();
        expect(serialized.raw).toEqual({ a: 'circular' });
    });

    // Test cases for various other inputs
    
    // Test case for null input
    it('should handle null as input', () => {
        const input = null;
        const expectedMessage = 'null';
        const serialized = serializeError(input);
        expect(serialized.message).toBe(expectedMessage);
    });

    // Test case for undefined input
    it('should handle undefined as input', () => {
        const input = undefined;
        const expectedMessage = 'undefined';
        const serialized = serializeError(input);
        expect(serialized.message).toBe(expectedMessage);
    });

    // Test case for number input
    it('should handle 123 as input', () => {
        const input = 123;
        const expectedMessage = '123';
        const serialized = serializeError(input);
        expect(serialized.message).toBe(expectedMessage);
    });

    // Test case for boolean input
    it('should handle true as input', () => {
        const input = true;
        const expectedMessage = 'true';
        const serialized = serializeError(input);
        expect(serialized.message).toBe(expectedMessage);
    });

    // Test for a non-serializable input that also causes issues in the final catch block
    it('should handle non-serializable inputs that also fail in the final catch block', () => {
        const nonSerializable = {
            toJSON: () => {
                throw new Error('Serialization failed');
            },
        };

        // Mocking the error message to simulate a failure in the catch block
        Object.defineProperty(nonSerializable, 'message', {
            get: () => {
                throw new Error('Another failure');
            },
            configurable: true
        });

        const serialized = serializeError(nonSerializable);
        expect(serialized.message).toContain('An error occurred that could not be serialized');
    });

    describe('an error whose cause is a plain value', () => {
        it('keeps the error and its string cause', () => {
            const error = new Error('Request failed', { cause: 'socket hang up' });

            const serialized = serializeError(error);

            expect(serialized.type).toBe('Error');
            expect(serialized.name).toBe('Error');
            expect(serialized.message).toBe('Request failed');
            expect(serialized.stack).toBe(error.stack);
            expect(serialized.cause_raw).toBe('socket hang up');
            expect(serialized.cause).toEqual({ type: 'string', message: 'socket hang up', raw: 'socket hang up' });
        });

        it.each([
            ['a string', 'socket hang up'],
            ['an empty string', ''],
            ['a number', 42],
            ['zero', 0],
            ['false', false],
            ['a bigint', 10n],
            ['a symbol', Symbol('reason')],
        ])('keeps the error, and describes its cause, when the cause is %s', (_label, cause) => {
            const serialized = serializeError(new Error('Request failed', { cause }));

            expect(serialized.type).toBe('Error');
            expect(serialized.message).toBe('Request failed');
            expect(serialized.cause?.message).toBe(String(cause));
            expect(SerializableErrorSchema.safeParse(serialized).success).toBe(true);
            expect(() => JSON.stringify(serialized)).not.toThrow();
        });

        it('keeps an error-like object and its string cause', () => {
            const serialized = serializeError({ message: 'Request failed', cause: 'socket hang up' });

            expect(serialized.type).toBe('object');
            expect(serialized.message).toBe('Request failed');
            expect(serialized.cause_raw).toBe('socket hang up');
            expect(serialized.cause?.message).toBe('socket hang up');
        });

        it('keeps an error-like object whose cause is present but undefined', () => {
            const serialized = serializeError({ message: 'Request failed', cause: undefined });

            expect(serialized.type).toBe('object');
            expect(serialized.message).toBe('Request failed');
            expect(serialized.cause?.type).toBe('undefined');
        });
    });
});