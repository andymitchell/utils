

import { cloneDeepScalarValues, cloneDeepScalarValuesAny } from "./cloneDeepScalarValues.ts"

function getInput() {
    return {
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
}

function getArrayInput() {
    const arr = [
        { name: "Bob" },
        { age: 20 },
        [
            { pet: "dog" },
            { creditCard: 1234123412341234 },
            { lifespan: 80 }
        ],
        "an ode",
        "asuspiciouslylongtokenohnodanger",
        true
    ]

    return {
        input: arr,
        expect: arr,
        expectStripped: [
            { name: "Bob" },
            { age: 20 },
            [
                { pet: "dog" },
                { creditCard: "12...34" },
                { lifespan: 80 }
            ],
            "an ode",
            "asu...ger",
            true
        ]
    }

}


function getNonScalarArrayInput() {
    return {
        input: [
            { name: new Error("Bob") },
            { age: () => 20 },
            [
                { lifespan: () => 80 }
            ],
            () => null,
            null,
            "this works"
        ],
        expected: [
            { name: { message: "Bob" } },
            {},
            [
                {}
            ],
            undefined,
            undefined,
            "this works"
        ]
    }
}

describe('cloneDeepScalarValuesAny', () => {

    describe('scalars', () => {

        describe('basic', () => {
            it('handles string', () => {
                expect(cloneDeepScalarValuesAny('hello')).toBe('hello');
            })
            it('handles number', () => {
                expect(cloneDeepScalarValuesAny(12)).toBe(12);
            })
            it('handles number 0', () => {
                expect(cloneDeepScalarValuesAny(0)).toBe(0);
            })
            it('handles boolean', () => {
                expect(cloneDeepScalarValuesAny(true)).toBe(true);
            })
        })

        describe('security', () => {
            it('masks string', () => {
                expect(cloneDeepScalarValuesAny('abcdefghijklmnopqrst', true)).toBe('abc...rst');
            })
        })

    })

    describe('non-scalars', () => {
        it('turns function undefined', () => {
            expect(cloneDeepScalarValuesAny(() => '')).toBe(undefined);
        })
        it('turns Date to an empty object', () => {
            expect(cloneDeepScalarValuesAny(new Date())).toEqual({});
        })
        it('handles undefined', () => {
            expect(cloneDeepScalarValuesAny(undefined)).toBe(undefined);
        })
        it('handles null', () => {
            expect(cloneDeepScalarValuesAny(null)).toBe(undefined);
        })
    })


})


function testObjectsAndArrays(name: string, cloneFunc: typeof cloneDeepScalarValues) {
    describe(`${name} for objects and arrays`, () => {

        describe("Can clone correctly", () => {
            test('basic', () => {
                const input = getInput();
                const output = cloneFunc(input);

                expect(output.request.email).toBe('bob@gmail.com');
                expect(output.issues[0].path[0]).toBe('scopes');
                expect(output.method.removeMe).toBe(undefined);

            })


            test('matches deeply', () => {
                const input = getInput();
                const input2 = getInput();
                // @ts-ignore
                input2.method.removeMe = null;
                // @ts-ignore
                delete input2.method.removeMe;

                const output = cloneFunc(input);

                expect(output).toEqual(input2);
            })



            test('error object', () => {
                const output = cloneFunc(new Error('hello'));

                expect(output.message).toBe('hello');
            })

            describe('arrays', () => {
                test('array in object', () => {
                    const input = getInput();
                    const output = cloneFunc([input]);

                    expect(output[0]!.method.available_scopes[0]).toBe('email');
                    expect(output[0]!.request.email).toBe('bob@gmail.com');
                })

                describe('good array is returned as is', () => {

                    test('no stripping', () => {
                        const arr = getArrayInput();
                        const output = cloneFunc(arr.input);

                        expect(output).toEqual(arr.expect);

                    })

                    test('strip sensitive info', () => {
                        const arr = getArrayInput();
                        const output = cloneFunc(arr.input, true);

                        expect(output).toEqual(arr.expectStripped);
                    })
                })

                describe('cleans up array with non-scalar', () => {
                    test('no stripping', () => {
                        const input = getNonScalarArrayInput();
                        const output = cloneFunc(input.input);

                        expect(output).toEqual(input.expected);
                    })

                    test('strip sensitive info', () => {
                        const input = getNonScalarArrayInput();
                        const output = cloneFunc(input.input, true);

                        expect(output).toEqual(input.expected);
                    })
                })

            })

        })

        test('private data removed', () => {
            const input = getInput();
            const output = cloneFunc(input, true);


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
            const input = getInput();
            const output = cloneFunc(input, true, true);


            expect(output.request.email).toBe('b...@...ail.com');
            expect(output.method.secret_numeric_token).toBe('12...67');
            expect(output.method.secret_number_string_token).toBe('12...89');
            expect(output.method.secret_numeric_credit_card).toBe('12...34');
            expect(output.method.id).toBe('lwa...gle');
            expect(output.method.redirect_uri_suffix).toBe('oauth2');
            expect(output.message).toBe(input.message);

            expect(output.method._dangerous_allow_id).toBe('123456789123456789123456789123456789');


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

                cloneFunc(maliciousObject);

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
                    output = cloneFunc(obj);
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
                    output = cloneFunc(maliciousObject);
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
                const output = cloneFunc(maliciousObject as any);
                // If the function relies on `obj.hasOwnProperty`, 'a' might be skipped.
                expect(output.a).toBe(1);
            });

            test('should handle Symbol properties', () => {
                const mySymbol = Symbol('mySymbol');
                const obj = {
                    a: 'string key',
                    [mySymbol]: 'symbol key'
                };

                const output = cloneFunc(obj);
                expect(output.a).toBe('string key');
                // The original function will fail this test because it ignores non-string keys.
                // A truly safe clone should probably ignore symbols, or handle them explicitly.
                // For now, let's assert it is undefined to prove the bug, then fix it to be included.
                // We will later change this expectation.
                expect(output[mySymbol]).toBe('symbol key');
            });

            test('should correctly handle a top-level array', () => {
                const arr = [{ a: 1 }, { b: () => 'function' }, { c: 3 }];
                const output = cloneFunc(arr);

                // The original function returns an object `{}`, not an array.
                expect(Array.isArray(output)).toBe(true);
                expect(output.length).toBe(3);
                expect(output[0]?.a).toBe(1);
                expect(output[1]).toEqual({}); // function stripped
                expect(output[2]?.c).toBe(3);
            });

            test('should not be vulnerable to prototype pollution via __proto__ property', () => {
                const maliciousObject = JSON.parse('{"__proto__": {"polluted": "true"}}');
                // @ts-ignore
                expect({}.polluted).toBeUndefined();

                cloneFunc(maliciousObject);

                // @ts-ignore
                expect({}.polluted).toBeUndefined();
            });

            test('should not be vulnerable to prototype pollution via constructor.prototype', () => {
                const maliciousObject = JSON.parse('{"constructor": {"prototype": {"polluted": "true"}}}');
                // @ts-ignore
                expect({}.polluted).toBeUndefined();

                cloneFunc(maliciousObject);

                // @ts-ignore
                expect({}.polluted).toBeUndefined();
            });

            test('should handle objects with null prototype', () => {
                const obj = Object.create(null);
                obj.a = 1;
                obj.b = 'hello';

                const output = cloneFunc(obj);
                expect(output).toEqual({ a: 1, b: 'hello' });
            });

            test('should correctly clone sparse arrays', () => {
                const sparseArray = [1, , 3]; // hole at index 1
                const output = cloneFunc(sparseArray);
                // vitest's toEqual correctly handles comparing empty slots with undefined
                expect(output).toEqual([1, undefined, 3]);
            });

            test('should handle deeply nested mixed arrays and objects', () => {
                const nested = [1, { a: [2, { b: 3 }] }, [4, 5]];
                const output = cloneFunc(nested);
                expect(output).toEqual([1, { a: [2, { b: 3 }] }, [4, 5]]);
            });

            test('should include non-enumerable properties because it uses Reflect.ownKeys', () => {
                const obj = { enumerable: 'yes' };
                Object.defineProperty(obj, 'nonEnumerable', {
                    value: 'also yes',
                    enumerable: false,
                });

                const output = cloneFunc(obj);
                expect(output).toEqual({ enumerable: 'yes', nonEnumerable: 'also yes' });
            });

            test('should treat class instances as plain objects, stripping methods', () => {
                class MyClass {
                    a = 1;
                    _b = "private-ish";

                    doSomething() {
                        return 'did it';
                    }
                }
                const instance = new MyClass();
                const output = cloneFunc(instance);

                // Methods on the prototype are not own-properties, so they are correctly ignored.
                expect(output).toEqual({ a: 1, _b: "private-ish" });
                expect(output.constructor).not.toBe(MyClass);
            });

            test('should treat complex objects like Date and RegExp as objects to be cloned', () => {
                const obj = {
                    d: new Date(), // Has no own scalar properties from Reflect.ownKeys
                    r: /abc/gi,   // Has a 'lastIndex' own property
                };
                const output = cloneFunc(obj);

                expect(output.d).toEqual({});
                // A regex object has an own property `lastIndex` which is a number (scalar)
                expect(output.r).toEqual({ lastIndex: 0 });
            });
        });

    })


}

testObjectsAndArrays('cloneDeepScalarValues', cloneDeepScalarValues);
testObjectsAndArrays('cloneDeepScalarValuesAny', cloneDeepScalarValuesAny as typeof cloneDeepScalarValues);