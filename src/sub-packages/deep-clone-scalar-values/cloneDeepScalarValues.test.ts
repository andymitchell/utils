

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
        expect(output.method.id).toBe('lwa...gle');
        expect(output.method.redirect_uri_suffix).toBe('oauth2');
        expect(output.message).toBe(input.message);
        

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