

import { cloneDeepScalarValues } from "./cloneDeepScalarValues.ts"

const input = {
    "message": "Here is a long message which should not be affected by token guarding. Here is a long message which should not be affected by token guarding.",
    "issues": [
        {
            "code": "invalid_type",
            "expected": "array",
            "received": "undefined",
            "path": [
                "scopes"
            ],
            "message": "Required"
        }
    ],
    "request": {
        "email": "bob@gmail.com"
    },
    "method": {
        "method": "lwaf-authorization-code-refresh",
        "id": "lwaf_auth_refresh_google",
        "redirect_uri_suffix": "oauth2",
        "description": "",
        "secret_numeric_token": 1234567891234567,
        "secret_number_string_token": "123456789123456789123456789123456789",
        "secret_numeric_credit_card": "1234 1234 1234 1234",
        "_dangerous_allow_id": "123456789123456789123456789123456789",
        "provider": {
            "type": "google"
        },
        "available_scopes": [
            "email"
        ],
        "removeMe": () => null
    }
} as const;

describe('cloneDeepScalarValues', () => {

    test('basic', () => {
        const output = cloneDeepScalarValues(input);

        expect(output.request.email).toBe('bob@gmail.com');
        expect(output.issues[0].path[0]).toBe('scopes');
        expect(output.method.removeMe).toBe(undefined);

    })

    test('private data removed', () => {
        const output = cloneDeepScalarValues(input, true);

        
        expect(output.request.email).toBe('b...@...ail.com');
        expect(output.method.secret_numeric_token).toBe('12...67');
        expect(output.method.secret_number_string_token).toBe('12...89');
        expect(output.method.secret_numeric_credit_card).toBe('12...34');
        expect(output.method._dangerous_allow_id).toBe('12...89');
        expect(output.method.id).toBe('lwa...gle');
        expect(output.method.redirect_uri_suffix).toBe('oauth2');
        expect(output.message).toBe(input.message);
        

    })
    


    test('private data removed, except dangerous', () => {
        const output = cloneDeepScalarValues(input, true, true);

        
        expect(output.request.email).toBe('b...@...ail.com');
        expect(output.method.secret_numeric_token).toBe('12...67');
        expect(output.method.secret_number_string_token).toBe('12...89');
        expect(output.method.secret_numeric_credit_card).toBe('12...34');
        expect(output.method.id).toBe('lwa...gle');
        expect(output.method.redirect_uri_suffix).toBe('oauth2');
        expect(output.message).toBe(input.message);

        expect(output.method._dangerous_allow_id).toBe('123456789123456789123456789123456789');
        

    })

    test('error object', () => {
        const output = cloneDeepScalarValues(new Error('hello'));
        
        expect(output.message).toBe('hello');
    })

    test('array', () => {
        const output = cloneDeepScalarValues([input]);

        expect(output[0]!.method.available_scopes[0]).toBe('email');
        expect(output[0]!.request.email).toBe('bob@gmail.com');
    })

})


describe('Security and Edge Case Tests', () => {

    test('should not be vulnerable to prototype pollution via a getter', () => {
        // This malicious object has a getter on 'pollute'. When accessed, it
        // tries to add a 'polluted' property to the prototype of all objects.
        const maliciousObject = {
            get pollute() {
                // @ts-ignore
                Object.prototype.polluted = 'true';
                return 'value';
            }
        };

        // First, confirm the prototype is clean.
        // @ts-ignore
        expect({}.polluted).toBe(undefined);

        cloneDeepScalarValues(maliciousObject);

        // The critical check: did running the clone function pollute the Object prototype?
        // @ts-ignore
        expect({}.polluted).toBe(undefined);
    });

    test('should not crash on circular references (denial of service)', () => {
        const obj: { a: string, self?: any } = { a: 'hello' };
        obj.self = obj; // Create a circular reference.

        // The original function would throw "Maximum call stack size exceeded".
        // A robust function should handle this gracefully. We expect it to not throw.
        let output: any;
        expect(() => {
            output = cloneDeepScalarValues(obj);
        }).not.toThrow();

        // The cloned self-reference shouldn't be a copy of the object,
        // as that would re-introduce the circular ref. It should be stripped.
        expect(output.self).toBe(undefined);
    });

    test('should not crash on a getter that throws an error', () => {
        const maliciousObject = {
            a: 'good value',
            get b() {
                throw new Error("I am a malicious getter!");
            },
            c: 'another good value'
        };

        let output: any;
        expect(() => {
            output = cloneDeepScalarValues(maliciousObject);
        }).not.toThrow();

        // The clone should contain the other valid properties.
        expect(output.a).toBe('good value');
        expect(output.c).toBe('another good value');
        // The property that threw should be omitted.
        expect(output.b).toBe(undefined);
    });

    test('should correctly handle an object that overrides hasOwnProperty', () => {
        const maliciousObject = {
            a: 1,
            hasOwnProperty: () => false, // This object lies about its own properties
        };
        const output = cloneDeepScalarValues(maliciousObject as any);
        // If the function relies on `obj.hasOwnProperty`, 'a' might be skipped.
        expect(output.a).toBe(1);
    });

    test('should handle Symbol properties', () => {
        const mySymbol = Symbol('mySymbol');
        const obj = {
            a: 'string key',
            [mySymbol]: 'symbol key'
        };

        const output = cloneDeepScalarValues(obj);
        expect(output.a).toBe('string key');
        // The original function will fail this test because it ignores non-string keys.
        // A truly safe clone should probably ignore symbols, or handle them explicitly.
        // For now, let's assert it is undefined to prove the bug, then fix it to be included.
        // We will later change this expectation.
        expect(output[mySymbol]).toBe('symbol key');
    });

    test('should correctly handle a top-level array', () => {
        const arr = [{ a: 1 }, { b: () => 'function' }, { c: 3 }];
        const output = cloneDeepScalarValues(arr);

        // The original function returns an object `{}`, not an array.
        expect(Array.isArray(output)).toBe(true);
        expect(output.length).toBe(3);
        expect(output[0]?.a).toBe(1);
        expect(output[1]).toEqual({}); // function stripped
        expect(output[2]?.c).toBe(3);
    });
});