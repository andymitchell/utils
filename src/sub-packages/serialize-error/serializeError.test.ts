import { describe, it, expect, vi } from 'vitest';
import { serializeError } from './serializeError.ts';


describe('serializeError', () => {
    // Test case for standard Error instances
    it('should correctly serialize a standard Error object', () => {
        const error = new Error('Something went wrong');
        error.name = 'CustomError';
        error.stack = 'Error: Something went wrong\n    at <anonymous>:1:7';

        const serialized = serializeError(error);

        expect(serialized).toEqual({
            message: 'Something went wrong',
            name: 'CustomError',
            stack: error.stack,
            cause: {},
            originalFormat: 'Error'
        });
    });

    // Test case for an Error with a cause
    it('should correctly serialize an Error object with a cause', () => {
        const cause = new Error('The underlying reason');
        const error = new Error('Main error', { cause });

        const serialized = serializeError(error);

        console.log(serialized);

        expect(serialized).toEqual({
            message: 'Main error',
            name: 'Error',
            stack: error.stack,
            cause: {
                message: cause.message
            },
            originalFormat: 'Error'
        });
    });

    // Test case for plain string inputs
    it('should handle plain string inputs', () => {
        const errorMessage = 'An error occurred';
        const serialized = serializeError(errorMessage);

        expect(serialized).toEqual({
            message: errorMessage,
            originalFormat: 'string'
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

        expect(serialized).toEqual({
            message: 'Error from object',
            name: 'ObjectError',
            stack: 'stack trace',
            cause: { reason: 'some dependency failed' },
            originalFormat: 'object'
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
        expect(serialized.message).toContain('An unknown error occurred that could not be serialized');
    });
});