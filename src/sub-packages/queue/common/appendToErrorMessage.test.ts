import { describe, it, expect } from 'vitest';

import { appendToErrorMessage } from './appendToErrorMessage.ts';

describe('adding context to an error on its way back to the caller', () => {

    it('adds the context to an ordinary error', () => {
        const error = new Error('Network unreachable');

        appendToErrorMessage(error, ' [descriptor: send-email]');

        expect(error.message).toBe('Network unreachable [descriptor: send-email]');
    });

    it('adds the context to an error whose message cannot be written to', () => {
        // An aborted or timed out fetch rejects with one of these, and its message is a getter
        // with no setter — so writing to it throws where nobody is watching.
        const error = new DOMException('The operation was aborted', 'AbortError');

        appendToErrorMessage(error, ' [descriptor: send-email]');

        expect(error.message).toBe('The operation was aborted [descriptor: send-email]');
    });

    it('leaves the error itself intact, so what it is remains recognisable', () => {
        const error = new DOMException('signal timed out', 'TimeoutError');

        appendToErrorMessage(error, ' [descriptor: send-email]');

        expect(error).toBeInstanceOf(DOMException);
        expect(error.name).toBe('TimeoutError');
    });

    it('never throws, even for an error that refuses to be annotated at all', () => {
        // Losing the context matters far less than losing the error.
        const error = Object.freeze(new Error('Frozen'));

        expect(() => appendToErrorMessage(error, ' [descriptor: send-email]')).not.toThrow();
        expect(error.message).toBe('Frozen');
    });

});
