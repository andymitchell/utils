

import { cloneDeepScalarValues, cloneDeepScalarValuesAny } from "./cloneDeepScalarValues.ts"
import { isScalar } from "./types.ts"
import { z } from "zod"

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
            null,
            "this works"
        ]
    }
}

describe('isScalar', () => {
    it('treats null as a scalar', () => {
        expect(isScalar(null)).toBe(true);
    })
    it('treats string, number and boolean as scalars', () => {
        expect(isScalar('hello')).toBe(true);
        expect(isScalar(0)).toBe(true);
        expect(isScalar(false)).toBe(true);
    })
    it('does not treat objects, arrays, functions or undefined as scalars', () => {
        expect(isScalar({})).toBe(false);
        expect(isScalar([])).toBe(false);
        expect(isScalar(() => {})).toBe(false);
        expect(isScalar(undefined)).toBe(false);
    })
})


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
            it('handles null', () => {
                expect(cloneDeepScalarValuesAny(null)).toBe(null);
            })
        })

        describe('security', () => {
            it('masks string', () => {
                expect(cloneDeepScalarValuesAny('abcdefghijklmnopqrst', { strip_sensitive_info: true })).toBe('abc...rst');
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
    })

    describe('boxed primitives', () => {
        it('unwraps a top-level boxed Number to its primitive', () => {
            expect(cloneDeepScalarValuesAny(new Number(5))).toBe(5);
        })
        it('unwraps a top-level boxed String to its primitive', () => {
            expect(cloneDeepScalarValuesAny(new String('hi'))).toBe('hi');
        })
        it('unwraps a top-level boxed Boolean to its primitive', () => {
            expect(cloneDeepScalarValuesAny(new Boolean(false))).toBe(false);
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
                        const output = cloneFunc(arr.input, { strip_sensitive_info: true });

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
                        const output = cloneFunc(input.input, { strip_sensitive_info: true });

                        expect(output).toEqual(input.expected);
                    })
                })

            })

        })

        describe('null is preserved', () => {
            test('a null property keeps its key with a null value', () => {
                const output = cloneFunc({ a: null, b: 1 });
                expect(output).toEqual({ a: null, b: 1 });
                expect('a' in output).toBe(true);
                expect(output.a).toBe(null);
            })
            test('a null array element is kept as null', () => {
                const output = cloneFunc([1, null, 3]);
                expect(output).toEqual([1, null, 3]);
                expect(output[1]).toBe(null);
            })
        })

        describe('boxed primitives', () => {
            test('a boxed Number value is unwrapped to its primitive', () => {
                const output: any = cloneFunc({ n: new Number(5) });

                expect(output.n).toBe(5);
                expect(typeof output.n).toBe('number');
            })
            test('a boxed String value is unwrapped to its primitive', () => {
                const output: any = cloneFunc({ s: new String('hi') });

                expect(output.s).toBe('hi');
                expect(typeof output.s).toBe('string');
            })
            test('a boxed Boolean value is unwrapped to its primitive', () => {
                const output: any = cloneFunc({ t: new Boolean(true), f: new Boolean(false) });

                expect(output.t).toBe(true);
                expect(output.f).toBe(false);
                expect(typeof output.t).toBe('boolean');
            })
            test('a boxed zero is unwrapped, not dropped', () => {
                const output: any = cloneFunc({ n: new Number(0) });

                expect(output.n).toBe(0);
            })
            test('the unwrapped clone serializes the same as its primitive form', () => {
                expect(JSON.stringify(cloneFunc({ n: new Number(5) }))).toBe(JSON.stringify({ n: 5 }));
            })
            test('a Number subclass instance is unwrapped to its primitive', () => {
                class BigBox extends Number {}
                const output: any = cloneFunc({ n: new BigBox(7) });

                expect(output.n).toBe(7);
            })
            test('a Date value is not treated as a boxed primitive', () => {
                const output: any = cloneFunc({ d: new Date(0) });

                expect(output.d).toEqual({});
            })
            test('a forged boxed primitive does not run its valueOf and is omitted', () => {
                let valueOfCalls = 0;
                const forged = { valueOf() { valueOfCalls++; return 5; } };
                Object.setPrototypeOf(forged, Number.prototype);

                const output: any = cloneFunc({ e: forged, ok: 1 });

                expect(valueOfCalls).toBe(0);
                expect('e' in output).toBe(false);
                expect(output.ok).toBe(1);
            })
        })

        test('private data removed', () => {
            const input = getInput();
            const output = cloneFunc(input, { strip_sensitive_info: true });


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
            const output = cloneFunc(input, { strip_sensitive_info: true, allow_sensitive_in_dangerous_properties: true });


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

            describe('circular', () => {
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
                    expect(output.self.a).toBe('hello');
                });

                it('should handle an object appearing twice in different locations (not circular) [regression]', () => {
                    const item1 = {"id":"2","name":"Alice","updated_at":1764929505905,"owner_email":"mockuser@gmail.com"};
                    const item2 = {"id":"2","name":"Alice","updated_at":1764929016780,"owner_email":"mockuser@gmail.com"};
                    const context = {
                        "all":
                            [
                                item1,
                                item2
                            ],
                        "items":[
                            item2
                        ]
                    }
                    

                    const output = cloneFunc(context, { strip_sensitive_info: true, allow_sensitive_in_dangerous_properties: false });

                    expect(context.items[0]).toBeTruthy();
                    expect(output.items[0]).toBeTruthy();


                })

                describe('skip_circular', () => {
                    test('by default a self-referential property is recreated as a cycle in the clone', () => {
                        const obj: { a: string, self?: any } = { a: 'hello' };
                        obj.self = obj;

                        const output: any = cloneFunc(obj);

                        expect(output.self).toBe(output);
                    })
                    test('a self-referential property is omitted', () => {
                        const obj: { a: string, self?: any } = { a: 'hello' };
                        obj.self = obj;

                        const output: any = cloneFunc(obj, { skip_circular: true });

                        expect('self' in output).toBe(false);
                        expect(output.a).toBe('hello');
                    })
                    test('the clone of a circular input can be JSON.stringified', () => {
                        const obj: { a: string, self?: any } = { a: 'hello' };
                        obj.self = obj;

                        const output = cloneFunc(obj, { skip_circular: true });

                        expect(() => JSON.stringify(output)).not.toThrow();
                        expect(JSON.parse(JSON.stringify(output))).toEqual({ a: 'hello' });
                    })
                    test('a mutual cycle is broken and the clone can be JSON.stringified', () => {
                        const a: { name: string, b?: any } = { name: 'a' };
                        const b: { name: string, a?: any } = { name: 'b' };
                        a.b = b;
                        b.a = a;

                        const output: any = cloneFunc(a, { skip_circular: true });

                        expect(output.name).toBe('a');
                        expect(output.b.name).toBe('b');
                        expect('a' in output.b).toBe(false);
                        expect(() => JSON.stringify(output)).not.toThrow();
                    })
                    test('a circular array element is omitted', () => {
                        const arr: any[] = [1, 2];
                        arr.push(arr);

                        const output: any = cloneFunc(arr, { skip_circular: true });

                        expect(() => JSON.stringify(output)).not.toThrow();
                        expect(output[0]).toBe(1);
                        expect(output[1]).toBe(2);
                        expect(output[2]).toBeUndefined();
                    })
                    test('a shared but non-circular object is still cloned in every position', () => {
                        const shared = { value: 42 };
                        const root = { first: shared, second: shared };

                        const output = cloneFunc(root, { skip_circular: true });

                        expect(output.first).toEqual({ value: 42 });
                        expect(output.second).toEqual({ value: 42 });
                    })
                    test('a shared-and-cyclic object keeps the shared edges and omits only the cyclic edge', () => {
                        const child: { name: string, parent?: any } = { name: 'child' };
                        const root: { a: any, b: any } = { a: child, b: child };
                        child.parent = root;

                        const output: any = cloneFunc(root, { skip_circular: true });

                        expect(output.a.name).toBe('child');
                        expect(output.b.name).toBe('child');
                        expect('parent' in output.a).toBe(false);
                        expect(() => JSON.stringify(output)).not.toThrow();
                    })
                })

            })


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

            describe('skip_symbols', () => {
                test('by default a Symbol-keyed property is cloned', () => {
                    const key = Symbol('s');
                    const output: any = cloneFunc({ [key]: 'kept', a: 1 });

                    expect(output[key]).toBe('kept');
                })
                test('Symbol-keyed properties are omitted', () => {
                    const key = Symbol('s');
                    const output: any = cloneFunc({ [key]: 'dropped', a: 1 }, { skip_symbols: true });

                    expect(output[key]).toBeUndefined();
                    expect(Reflect.ownKeys(output).some(k => typeof k === 'symbol')).toBe(false);
                    expect(output).toEqual({ a: 1 });
                })
            })

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


describe('cloneDeepScalarValues with a TreeNode-shaped object', () => {
    // Mirrors the TreeNode shape from objects/src/dot-prop-paths/zod.ts: regular scalar fields plus
    // a nested `children` tree, and two non-serializable hazards — a live Zod `schema` instance and
    // cyclic `parent` back-references (a node's `parent` is an ancestor that already contains it).
    type TestTreeNode = {
        name: string;
        dotprop_path: string;
        kind: string;
        children: TestTreeNode[];
        schema?: unknown;
        nameless_array_element?: boolean;
        parent?: TestTreeNode;
        descended_from_array?: boolean;
        optional_or_nullable?: boolean;
    };

    function buildTree(): TestTreeNode {
        const root: TestTreeNode = {
            name: 'root',
            dotprop_path: '',
            kind: 'ZodObject',
            descended_from_array: false,
            optional_or_nullable: false,
            schema: z.object({ id: z.string(), tags: z.array(z.string()) }),
            children: [],
        };
        const contact: TestTreeNode = {
            name: 'contact',
            dotprop_path: 'contact',
            kind: 'ZodObject',
            children: [],
        };
        const emails: TestTreeNode = {
            name: 'emails',
            dotprop_path: 'contact.emails',
            kind: 'ZodArray',
            descended_from_array: false,
            children: [],
        };
        const emailElement: TestTreeNode = {
            name: '',
            dotprop_path: 'contact.emails',
            kind: 'ZodString',
            nameless_array_element: true,
            descended_from_array: true,
            optional_or_nullable: true,
            schema: z.string(),
            children: [],
        };

        // Wire up the tree, then the cyclic parent back-references.
        root.children.push(contact);
        contact.parent = root;
        contact.children.push(emails);
        emails.parent = contact;
        emails.children.push(emailElement);
        emailElement.parent = emails;

        return root;
    }

    it('does not throw and produces a JSON-serializable clone', () => {
        const output = cloneDeepScalarValues(buildTree(), { skip_circular: true });

        expect(() => JSON.stringify(output)).not.toThrow();
    })

    it('preserves regular scalar fields and nesting at every depth', () => {
        const output: any = cloneDeepScalarValues(buildTree(), { skip_circular: true });

        expect(output.name).toBe('root');
        expect(output.dotprop_path).toBe('');
        expect(output.kind).toBe('ZodObject');
        expect(output.descended_from_array).toBe(false);
        expect(output.optional_or_nullable).toBe(false);

        const contact = output.children[0];
        expect(contact.name).toBe('contact');
        expect(contact.dotprop_path).toBe('contact');
        expect(contact.kind).toBe('ZodObject');

        const emails = contact.children[0];
        expect(emails.name).toBe('emails');
        expect(emails.dotprop_path).toBe('contact.emails');
        expect(emails.kind).toBe('ZodArray');

        const emailElement = emails.children[0];
        expect(emailElement.name).toBe('');
        expect(emailElement.kind).toBe('ZodString');
        expect(emailElement.nameless_array_element).toBe(true);
        expect(emailElement.descended_from_array).toBe(true);
        expect(emailElement.optional_or_nullable).toBe(true);
        expect(emailElement.children).toEqual([]);
    })

    it('drops the cyclic parent references at every depth', () => {
        const output: any = cloneDeepScalarValues(buildTree(), { skip_circular: true });

        const contact = output.children[0];
        const emails = contact.children[0];
        const emailElement = emails.children[0];

        expect('parent' in contact).toBe(false);
        expect('parent' in emails).toBe(false);
        expect('parent' in emailElement).toBe(false);
    })

    it('reduces Zod schema properties to inert, serializable data', () => {
        const output: any = cloneDeepScalarValues(buildTree(), { skip_circular: true });

        // The schema is recursed into, not dropped: its functions/getters are stripped, leaving plain data.
        expect(typeof output.schema).toBe('object');
        expect(typeof output.schema?.parse).not.toBe('function');
        expect(() => JSON.stringify(output.schema)).not.toThrow();

        // ...and the same for a schema nested deep in the tree.
        const emailElement = output.children[0].children[0].children[0];
        expect(typeof emailElement.schema).toBe('object');
        expect(typeof emailElement.schema?.parse).not.toBe('function');
    })
})