import { describe, it, expect } from 'vitest';
import { simplePrivateDataReplacer } from './simplePrivateDataReplacer.ts'; // Adjust path if needed

describe('simplePrivateDataReplacer', () => {

    describe('URL Sanitization', () => {
        it('should recursively sanitize a sensitive token in a URL query parameter', () => {
            const url = 'https://api.example.com/v1/users?token=a_very_long_and_super_secret_api_key_12345';
            const expected = 'https://api.example.com/v1/users?token=a_v...345';
            expect(simplePrivateDataReplacer(url)).toBe(expected);
        });

        it('should recursively sanitize a masked sensitive token in a URL query parameter', () => {
            const masked = "https://www.google.com/"+encodeURIComponent("a_very_long_and_super_secret_api_key_12345");
            const url = `https://api.example.com/v1/users?token=${masked}`;
            const expected = 'https://api.example.com/v1/users?token=htt...345';
            expect(simplePrivateDataReplacer(url)).toBe(expected);
        });

        it('should sanitize multiple sensitive parameters in a single URL', () => {
            const url = 'https://service.com/auth?email=sensitive.user@email.com&card_number=1234567890123456';
            // Note: The URL object encodes `@` as `%40`
            const expected = 'https://service.com/auth?email=s...%40...ail.com&card_number=12...56';
            expect(simplePrivateDataReplacer(url)).toBe(expected);
        });

        it('should not alter URLs without query parameters', () => {
            const url = 'https://docs.example.com/guides/getting-started';
            expect(simplePrivateDataReplacer(url)).toBe(url);
        });

        it('should preserve URL fragments', () => {
            const url = 'https://app.example.com/dashboard?session=longsessiontokenabcdef123#section-3';
            const expected = 'https://app.example.com/dashboard?session=lon...123#section-3';
            expect(simplePrivateDataReplacer(url)).toBe(expected);
        });

        it('should handle malformed URLs gracefully by treating them as regular strings', () => {
            // This string will fail new URL() but is long enough to be a token
            const malformedUrl = "https://this_is_not_valid_bad@@";
            const expected = 'htt...d@@'; // Falls back to token sanitization
            expect(simplePrivateDataReplacer(malformedUrl)).toBe(expected);
        });
    });

    describe('Token Sanitization (Stress Tests)', () => {
        it('should sanitize a standard JWT token', () => {
            const log = 'Auth successful with token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const expected = 'Auth successful with token: eyJ...w5c';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should sanitize a bearer token, preserving the "Bearer" prefix', () => {
            const log = 'Authorization: Bearer sl.Bdfa7s987f9asdfASDF123asfASDF123ASDFasf987asdf987ASDF';
            const expected = 'Authorization: Bearer sl....SDF';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should sanitize a long hex-based API key', () => {
            const key = 'abcdef1234567890abcdef1234567890abcdef1234567890';
            const expected = 'abc...890';
            expect(simplePrivateDataReplacer(key)).toBe(expected);
        });



        it('should sanitize a prefixed API key (e.g., Stripe)', () => {
            const key = 'sk_live_aVeryLongAndComplexStringToServeAsTheKey';
            const expected = 'sk_...Key';
            expect(simplePrivateDataReplacer(key)).toBe(expected);
        });


        it('should sanitize a token with non alphanumeric characters', () => {
            const token = 'dXNlcj=-][\';/,.`~?><|":}{)(*&^%$£@!rablah'; // "user:thisisaverylong password"
            const expected = 'dXN...lah';
            expect(simplePrivateDataReplacer(token)).toBe(expected);
        });

        it('should sanitize a base64 encoded token that is long enough', () => {
            const token = 'dXNlcjp0aGlzaXNhdmVyeWxvbmcgcGFzc3dvcmQ='; // "user:thisisaverylong password"
            const expected = 'dXN...mQ=';
            expect(simplePrivateDataReplacer(token)).toBe(expected);
        });

        it('should sanitize a token exactly 20 characters long', () => {
            const token = '12345678901234567890';
            const expected = '12...90';
            expect(simplePrivateDataReplacer(token)).toBe(expected);
        });

        it('should NOT sanitize a token that is 19 characters long', () => {
            const token = 'abcdefghijklmnopqr';
            expect(simplePrivateDataReplacer(token)).toBe(token);
        });


        it('should sanitize a token embedded within an object that gets stringified', () => {
            const data = { user: 'test', apiKey: 'pk_test_abcdefghijklmnopqrstuvwxyz123456' };
            const expected = JSON.stringify({ user: 'test', apiKey: 'pk...56' }, undefined, 1); // It includes quotes, hence reducing the size to 2 characters
            expect(simplePrivateDataReplacer(data)).toBe(expected);
        });
    });

    describe('Digit Sequence Sanitization', () => {
        it('should sanitize a credit card number with dashes', () => {
            const log = 'Card used: 1234-5678-9012-3456';
            const expected = 'Card used: 12...56';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('respects ending spaces', () => {
            const log = 'There are 12345678 errors';
            const expected = 'There are 12...78 errors';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should sanitize a phone number with spaces and parentheses', () => {
            const log = 'Call +1 (555) 123-4567 for support';
            const expected = 'Call +15...67 for support';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should sanitize a long sequence of digits with no separators', () => {
            const log = 'ID: 9876543210987';
            const expected = 'ID: 98...87';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should not sanitize a short sequence of digits (fewer than 7)', () => {
            const shortNum = 'ID: 123456';
            expect(simplePrivateDataReplacer(shortNum)).toBe(shortNum);
        });

        it('should sanitize a digit sequence of exactly 7 digits', () => {
            const log = 'Code: 1234567';
            const expected = 'Code: 12...67';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });
    });

    describe('Email Sanitization', () => {
        it('should sanitize a standard email address', () => {
            const log = 'User logged in as test.user@example.com';
            const expected = 'User logged in as t...@...ple.com';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });

        it('should not alter an email with a very short local-part', () => {
            const log = 'Contact x@example.com for details';
            expect(simplePrivateDataReplacer(log)).toBe(log);
        });

        it('should correctly sanitize an email with a long TLD', () => {
            const log = 'Email is a.user@subdomain.international';
            const expected = 'Email is a...@...ational';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });
    });

    describe('Benign Inputs and Non-Sensitive Edge Cases', () => {
        it('should return a simple, non-sensitive string as-is', () => {
            const text = 'Hello world, this is a log message.';
            expect(simplePrivateDataReplacer(text)).toBe(text);
        });

        it('should handle an empty string', () => {
            expect(simplePrivateDataReplacer('')).toBe('');
        });

        it('should handle numbers by converting them to strings', () => {
            expect(simplePrivateDataReplacer(12345)).toBe('12345');
        });

        it('should handle booleans by converting them to strings', () => {
            expect(simplePrivateDataReplacer(true)).toBe('true');
            expect(simplePrivateDataReplacer(false)).toBe('false');
        });

        it('should handle a simple object by JSON stringifying it', () => {
            const obj = { id: 123, name: 'test-object', active: true };
            const expected = JSON.stringify(obj, undefined, 1);
            expect(simplePrivateDataReplacer(obj)).toBe(expected);
        });
    });

    describe('Hardening and Attack Vector Tests', () => {


        it('should handle unserializable objects with circular references', () => {
            const circularObj: any = {};
            circularObj.a = circularObj;
            const expected = '[Sanitized: Unserializable Input]';
            expect(simplePrivateDataReplacer(circularObj)).toBe(expected);
        });

        it('should handle null and undefined inputs gracefully', () => {
            expect(simplePrivateDataReplacer(null)).toBe('[sanitized:null]');
            expect(simplePrivateDataReplacer(undefined)).toBe('[sanitized:undefined]');
        });

        it('should handle an extremely long string that is not an email without crashing (ReDoS test)', () => {
            // This would cause catastrophic backtracking on a naive email regex.
            // Our lookahead `(?=\b.{1,254}\b)` prevents the email match.
            // It should fall back to the generic token replacer.
            const longString = 'a@' + 'b.'.repeat(1000) + 'com';
            const expected = 'a@b...com';
            expect(simplePrivateDataReplacer(longString)).toBe(expected);
        });
    });

    describe('Mixed Content Tests', () => {
        it('should sanitize all sensitive types in a single complex string', () => {
            const log = 'User test@example.com (ID: 1234567890) triggered an event from https://api.service.com/v2/action?apiKey=superlongapikeythatshouldbehidden12345. Session: abcdefghijklmnopqrstuvwxyz1234567890';
            const expected = 'User t...@...ple.com (ID: 12...90) triggered an event from https://api.service.com/v2/action?apiKey=sup...45. Session: abc...890';
            expect(simplePrivateDataReplacer(log)).toBe(expected);
        });
    });
});