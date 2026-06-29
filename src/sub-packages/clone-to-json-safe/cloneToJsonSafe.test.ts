

import { cloneToJsonSafe, cloneToJsonSafeUnknown } from "./cloneToJsonSafe.ts"
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


describe('cloneToJsonSafeUnknown', () => {

    describe('scalars', () => {

        describe('basic', () => {
            it('handles string', () => {
                expect(cloneToJsonSafeUnknown('hello')).toBe('hello');
            })
            it('handles number', () => {
                expect(cloneToJsonSafeUnknown(12)).toBe(12);
            })
            it('handles number 0', () => {
                expect(cloneToJsonSafeUnknown(0)).toBe(0);
            })
            it('handles boolean', () => {
                expect(cloneToJsonSafeUnknown(true)).toBe(true);
            })
            it('handles null', () => {
                expect(cloneToJsonSafeUnknown(null)).toBe(null);
            })
        })

        describe('security', () => {
            it('masks string', () => {
                expect(cloneToJsonSafeUnknown('abcdefghijklmnopqrst', { strip_sensitive_info: true })).toBe('abc...rst');
            })
        })

    })

    describe('non-scalars', () => {
        it('turns function undefined', () => {
            expect(cloneToJsonSafeUnknown(() => '')).toBe(undefined);
        })
        it('drops a top-level Date under the default drop mode', () => {
            expect(cloneToJsonSafeUnknown(new Date())).toBe(undefined);
        })
        it('redacts a top-level Date, blending in its ISO string', () => {
            expect(cloneToJsonSafeUnknown(new Date('2026-06-18T00:00:00.000Z'), { non_serialisable_handling: 'redact' })).toBe('redact:Date:2026-06-18T00:00:00.000Z');
        })
        it('normalises a top-level Date to its ISO string', () => {
            expect(cloneToJsonSafeUnknown(new Date('2026-06-18T00:00:00.000Z'), { non_serialisable_handling: 'normalise' })).toBe('2026-06-18T00:00:00.000Z');
        })
        it('redacts a top-level bigint, blending in its digits', () => {
            expect(cloneToJsonSafeUnknown(10n, { non_serialisable_handling: 'redact' })).toBe('redact:bigint:10');
        })
        it('handles undefined', () => {
            expect(cloneToJsonSafeUnknown(undefined)).toBe(undefined);
        })
    })

    describe('boxed primitives', () => {
        it('unwraps a top-level boxed Number to its primitive', () => {
            expect(cloneToJsonSafeUnknown(new Number(5))).toBe(5);
        })
        it('unwraps a top-level boxed String to its primitive', () => {
            expect(cloneToJsonSafeUnknown(new String('hi'))).toBe('hi');
        })
        it('unwraps a top-level boxed Boolean to its primitive', () => {
            expect(cloneToJsonSafeUnknown(new Boolean(false))).toBe(false);
        })
    })


})


function testObjectsAndArrays(name: string, cloneFunc: typeof cloneToJsonSafe) {
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
            test('a Date value is recognised as a Date, not unwrapped like a boxed primitive', () => {
                // drop (default) omits it; redact proves it was classified as a Date rather than coerced to a number.
                expect('d' in cloneFunc({ d: new Date(0) })).toBe(false);
                expect((cloneFunc({ d: new Date(0) }, { non_serialisable_handling: 'redact' }) as any).d).toBe('redact:Date:1970-01-01T00:00:00.000Z');
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


        describe('preserve_unmasked_paths keeps known-safe ids at chosen paths, gated by path AND shape', () => {

            const UUID = '550e8400-e29b-41d4-a716-446655440000';
            const MASKED_UUID = '550....00';
            const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

            test('a UUID at an allowlisted path is kept intact', () => {
                const output: any = cloneFunc(
                    { user: { id: UUID } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(output.user.id).toBe(UUID);
            })

            test('a ULID at an allowlisted path is kept intact', () => {
                const output: any = cloneFunc(
                    { trace: { id: ULID } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'trace.id', shape: 'ulid' }] },
                );
                expect(output.trace.id).toBe(ULID);
            })

            test('a UUID at a path that is not allowlisted is still masked (default-deny)', () => {
                const output: any = cloneFunc(
                    { user: { id: UUID } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'account.id', shape: 'uuid' }] },
                );
                expect(output.user.id).toBe(MASKED_UUID);
            })

            test('a non-UUID value at a UUID-allowlisted path is still masked (drift / confused-deputy guard)', () => {
                // The path is trusted to hold a UUID, but here it holds an email. Trusting the path alone
                // would leak it; the shape gate keeps it masked.
                const output: any = cloneFunc(
                    { user: { id: 'bob@gmail.com' } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(output.user.id).toBe('b...@...ail.com');
            })

            test('a value that merely contains a UUID is masked, not preserved (no substring smuggling)', () => {
                const smuggled = `${UUID} Bearer sk_secret_token_abcdefhij`;
                const output: any = cloneFunc(
                    { user: { id: smuggled } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(output.user.id).not.toBe(smuggled);
                expect(output.user.id).not.toContain('sk_secret_token_abcdefhij');
            })

            test('only the exact path is exempt; a sibling at a near path is masked', () => {
                const output: any = cloneFunc(
                    { a: { b: { c: UUID, d: UUID } } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'a.b.c', shape: 'uuid' }] },
                );
                expect(output.a.b.c).toBe(UUID);
                expect(output.a.b.d).toBe(MASKED_UUID);
            })

            test('an allowlisted path addresses array elements by index', () => {
                const output: any = cloneFunc(
                    { items: [{ ref: UUID }, { ref: UUID }] },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'items.0.ref', shape: 'uuid' }] },
                );
                expect(output.items[0].ref).toBe(UUID);        // exempt
                expect(output.items[1].ref).toBe(MASKED_UUID); // not exempt
            })

            test('one instance reached via an allowlisted and a denied path is masked per its own path, regardless of property order', () => {
                // A shared (aliased) object must not inherit whichever path was cloned first: the allowlisted
                // edge keeps the UUID, the denied edge masks it — both ways round.
                const shared = { id: UUID };

                const allowlistedPathFirst: any = cloneFunc(
                    { user: shared, audit: shared },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(allowlistedPathFirst.user.id).toBe(UUID);         // allowlisted edge preserved
                expect(allowlistedPathFirst.audit.id).toBe(MASKED_UUID); // aliased denied edge masked (no leak)

                const deniedPathFirst: any = cloneFunc(
                    { audit: shared, user: shared },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(deniedPathFirst.user.id).toBe(UUID);          // allowlist still applies when denied edge is first
                expect(deniedPathFirst.audit.id).toBe(MASKED_UUID);
            })

            test('a true cycle is still resolved (no infinite loop) while an allowlisted id is preserved', () => {
                // The re-clone-shared-refs path must not break genuine cycles: obj on the live path resolves
                // to its in-progress clone rather than re-cloning forever.
                const node: any = { id: UUID };
                node.self = node;
                let output: any;
                expect(() => {
                    output = cloneFunc(node, { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'id', shape: 'uuid' }] });
                }).not.toThrow();
                expect(output.id).toBe(UUID);
                expect(output.self).toBe(output); // cycle preserved as a self-reference
            })

            test('a number at a uuid path is masked (the uuid shape matches strings only)', () => {
                const output: any = cloneFunc(
                    { user: { id: 1234567891234567 } },
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(output.user.id).toBe('12...67');
            })

            test('the path+shape and _dangerous exemptions both apply within one clone', () => {
                const output: any = cloneFunc(
                    { user: { id: UUID }, _dangerousToken: '123456789123456789' },
                    {
                        strip_sensitive_info: true,
                        allow_sensitive_in_dangerous_properties: true,
                        preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }],
                    },
                );
                expect(output.user.id).toBe(UUID);
                expect(output._dangerousToken).toBe('123456789123456789');
            })

            test('an empty allowlist masks exactly as plain stripping does (regression)', () => {
                const input = { user: { id: UUID }, secret: 'sk_live_token_aaaaaaaaaaaaaaaaaaaa' };
                const withEmptyOption: any = cloneFunc(input, { strip_sensitive_info: true, preserve_unmasked_paths: [] });
                const withoutOption: any = cloneFunc(input, { strip_sensitive_info: true });
                expect(withEmptyOption).toEqual(withoutOption);
                expect(withEmptyOption.user.id).toBe(MASKED_UUID);
            })

            test('an explicitly-undefined allowlist behaves like an absent one (does not crash)', () => {
                let output: any;
                expect(() => {
                    output = cloneFunc(
                        { user: { id: UUID }, secret: 'sk_live_token_aaaaaaaaaaaaaaaaaaaa' },
                        { strip_sensitive_info: true, preserve_unmasked_paths: undefined },
                    );
                }).not.toThrow();
                expect(output.user.id).toBe(MASKED_UUID);
            })

            test('the allowlist is inert unless strip_sensitive_info is on', () => {
                // With stripping off nothing is masked anyway; the allowlist must not change that.
                const output: any = cloneFunc(
                    { user: { id: UUID }, other: 'bob@gmail.com' },
                    { preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] },
                );
                expect(output.user.id).toBe(UUID);
                expect(output.other).toBe('bob@gmail.com');
            })

            test('the shape set is closed: an unknown shape is a compile error and fails closed (masks) at runtime', () => {
                const output: any = cloneFunc(
                    { user: { id: UUID } },
                    // @ts-expect-error 'email' is not (yet) a PreservableValueShape
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'email' }] },
                );
                expect(output.user.id).toBe(MASKED_UUID);
            })

            test('a shape name inherited from Object.prototype (toString/constructor) is not a matcher and still masks', () => {
                // Only own registry entries (uuid/ulid) count. A bracket lookup would otherwise resolve
                // Object.prototype.toString / the Object constructor and let any string through unmasked.
                const secret = 'sk_live_supersecrettoken_aaaaaaaa';

                const viaToString: any = cloneFunc(
                    { user: { id: secret } },
                    // @ts-expect-error 'toString' is not a PreservableValueShape
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'toString' }] },
                );
                expect(viaToString.user.id).not.toBe(secret);
                expect(viaToString.user.id).not.toContain('supersecrettoken');

                const viaConstructor: any = cloneFunc(
                    { user: { id: secret } },
                    // @ts-expect-error 'constructor' is not a PreservableValueShape
                    { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'constructor' }] },
                );
                expect(viaConstructor.user.id).not.toBe(secret);
                expect(viaConstructor.user.id).not.toContain('supersecrettoken');
            })

            describe('metamorphic', () => {

                test('preserving is idempotent — re-cloning a preserved output is a no-op', () => {
                    const options = { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' as const }] };
                    const once: any = cloneFunc({ user: { id: UUID } }, options);
                    const twice: any = cloneFunc(once, options);
                    expect(twice).toEqual(once);
                    expect(twice.user.id).toBe(UUID);
                })

                test('a value that is not a whole-value shape match gives the same output whether or not its path is allowlisted', () => {
                    const input = { user: { id: 'bob@gmail.com' } }; // not a UUID
                    const allowlisted: any = cloneFunc(input, { strip_sensitive_info: true, preserve_unmasked_paths: [{ path: 'user.id', shape: 'uuid' }] });
                    const notAllowlisted: any = cloneFunc(input, { strip_sensitive_info: true });
                    expect(allowlisted).toEqual(notAllowlisted);
                })
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

            describe('allow_symbols', () => {
                test('by default a Symbol-keyed property is dropped (symbols have no JSON form)', () => {
                    const key = Symbol('s');
                    const output: any = cloneFunc({ [key]: 'dropped', a: 'string key' });

                    expect(output.a).toBe('string key');
                    expect(output[key]).toBeUndefined();
                    expect(Reflect.ownKeys(output).some(k => typeof k === 'symbol')).toBe(false);
                    expect(output).toEqual({ a: 'string key' });
                })
                test('a Symbol-keyed property is cloned when symbols are allowed', () => {
                    const key = Symbol('s');
                    const output: any = cloneFunc({ [key]: 'kept', a: 1 }, { allow_symbols: true });

                    expect(output[key]).toBe('kept');
                    expect(output.a).toBe(1);
                })
                test('a Symbol value is kept as-is when symbols are allowed', () => {
                    const sym = Symbol('v');
                    const output: any = cloneFunc({ s: sym, a: 1 }, { allow_symbols: true });

                    expect(output.s).toBe(sym);
                    expect(output.a).toBe(1);
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

            test('drops complex internal-slot objects like Date and RegExp under the default drop mode', () => {
                const obj = {
                    d: new Date(), // data lives in an internal slot, not own keys
                    r: /abc/gi,    // ditto — not cleanly walkable
                    keep: 'me',
                };
                const output: any = cloneFunc(obj);

                expect('d' in output).toBe(false);
                expect('r' in output).toBe(false);
                expect(output.keep).toBe('me');
            });
        });

    })


}

testObjectsAndArrays('cloneToJsonSafe', cloneToJsonSafe);
testObjectsAndArrays('cloneToJsonSafeUnknown', cloneToJsonSafeUnknown as typeof cloneToJsonSafe);


describe('cloneToJsonSafe with a TreeNode-shaped object', () => {
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
        const output = cloneToJsonSafe(buildTree(), { skip_circular: true });

        expect(() => JSON.stringify(output)).not.toThrow();
    })

    it('preserves regular scalar fields and nesting at every depth', () => {
        const output: any = cloneToJsonSafe(buildTree(), { skip_circular: true });

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
        const output: any = cloneToJsonSafe(buildTree(), { skip_circular: true });

        const contact = output.children[0];
        const emails = contact.children[0];
        const emailElement = emails.children[0];

        expect('parent' in contact).toBe(false);
        expect('parent' in emails).toBe(false);
        expect('parent' in emailElement).toBe(false);
    })

    it('reduces Zod schema properties to inert, serializable data', () => {
        const output: any = cloneToJsonSafe(buildTree(), { skip_circular: true });

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


// A single object carrying one of every JSON-hostile hazard, reused across the three modes so each
// mode is described by the same surface.
const SHARED_SYMBOL = Symbol('shared');
function buildHazards() {
    return {
        keepStr: 'hi',
        keepNum: 42,
        keepBool: true,
        keepNull: null,
        big: 10n,
        nan: NaN,
        pInf: Infinity,
        nInf: -Infinity,
        fn: () => 1,
        sym: SHARED_SYMBOL,
        date: new Date('2026-06-18T00:00:00.000Z'),
        map: new Map([['a', 1]]),
        set: new Set([1, 2]),
        regex: /abc/gi,
        promise: Promise.resolve(1),
        typed: new Uint8Array([1, 2, 3]),
        nested: { big: 5n, ok: 'x' },
        arr: [1n, 'y', () => 2] as any[],
    };
}

describe('non_serialisable_handling', () => {

    describe('drop (default): non-serialisable keys are stripped', () => {
        test('every non-serialisable leaf drops its key, leaving only clean values', () => {
            const out: any = cloneToJsonSafe(buildHazards());

            expect(out).toEqual({
                keepStr: 'hi',
                keepNum: 42,
                keepBool: true,
                keepNull: null,
                typed: { 0: 1, 1: 2, 2: 3 },
                nested: { ok: 'x' },
                arr: [undefined, 'y', undefined],
            });
        })
        test('the default and an explicit drop agree', () => {
            expect(cloneToJsonSafe(buildHazards())).toEqual(
                cloneToJsonSafe(buildHazards(), { non_serialisable_handling: 'drop' }),
            );
        })
    })

    describe('normalise: values become what JSON.stringify would produce', () => {
        test('scalars and dates/maps/sets normalise; functions and symbols drop', () => {
            const out: any = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: 'normalise' });

            expect(out).toEqual({
                keepStr: 'hi',
                keepNum: 42,
                keepBool: true,
                keepNull: null,
                big: null,
                nan: null,
                pInf: null,
                nInf: null,
                date: '2026-06-18T00:00:00.000Z',
                map: {},
                set: {},
                regex: {},
                promise: {},
                typed: { 0: 1, 1: 2, 2: 3 },
                nested: { big: null, ok: 'x' },
                arr: [null, 'y', null], // bigint and function array elements become null, as JSON.stringify does
            });
        })
        test('an invalid Date normalises to null, matching JSON.stringify', () => {
            const out: any = cloneToJsonSafe({ d: new Date('nope') }, { non_serialisable_handling: 'normalise' });
            expect(out.d).toBe(null);
        })
        test('honours toJSON like JSON.stringify (URL → its href string)', () => {
            const out: any = cloneToJsonSafe({ u: new URL('https://example.com/x?q=1') }, { non_serialisable_handling: 'normalise' });
            expect(out.u).toBe('https://example.com/x?q=1');
        })
    })

    describe('redact: every non-serialisable leaf leaves a redact:<Type> trace, blending a safe value where one exists', () => {
        test('each hazard is replaced by a typed marker, keeping its key', () => {
            const out: any = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: 'redact' });

            expect(out).toEqual({
                keepStr: 'hi',
                keepNum: 42,
                keepBool: true,
                keepNull: null,
                big: 'redact:bigint:10',
                nan: 'redact:NaN',
                pInf: 'redact:Infinity',
                nInf: 'redact:Infinity',
                fn: 'redact:Function',
                sym: 'redact:Symbol',
                date: 'redact:Date:2026-06-18T00:00:00.000Z',
                map: 'redact:Map',
                set: 'redact:Set',
                regex: 'redact:RegExp:/abc/gi',
                promise: 'redact:Promise',
                typed: { 0: 1, 1: 2, 2: 3 },
                nested: { big: 'redact:bigint:5', ok: 'x' },
                arr: ['redact:bigint:1', 'y', 'redact:Function'],
            });
        })
    })

    describe('getters interact with allow_getters', () => {
        const withGetter = () => ({ a: 1, get g() { return 5; } });

        test('an unread getter is dropped by default (drop) and never executed', () => {
            let calls = 0;
            const out: any = cloneToJsonSafe({ a: 1, get g() { calls++; return 5; } });
            expect('g' in out).toBe(false);
            expect(calls).toBe(0);
        })
        test('an unread getter leaves a redact:Getter trace in redact mode, still unexecuted', () => {
            let calls = 0;
            const out: any = cloneToJsonSafe({ a: 1, get g() { calls++; return 5; } }, { non_serialisable_handling: 'redact' });
            expect(out.g).toBe('redact:Getter');
            expect(calls).toBe(0);
        })
        test('allow_getters executes the getter and clones its returned value', () => {
            const out: any = cloneToJsonSafe(withGetter(), { allow_getters: true });
            expect(out.g).toBe(5);
        })
        test('a getter returning a bigint is reclassified by the mode once executed', () => {
            const out: any = cloneToJsonSafe({ get g() { return 9n; } }, { allow_getters: true, non_serialisable_handling: 'redact' });
            expect(out.g).toBe('redact:bigint:9');
        })
        test('a getter that throws is treated as unread even when getters are allowed', () => {
            const out: any = cloneToJsonSafe({ get g() { throw new Error('boom'); } }, { allow_getters: true, non_serialisable_handling: 'redact' });
            expect(out.g).toBe('redact:Getter');
        })
    })

    describe('symbol values follow the mode when symbols are not allowed', () => {
        test('redact marks a symbol value', () => {
            const out: any = cloneToJsonSafe({ s: Symbol('x') }, { non_serialisable_handling: 'redact' });
            expect(out.s).toBe('redact:Symbol');
        })
        test('drop omits a symbol value', () => {
            const out: any = cloneToJsonSafe({ s: Symbol('x'), a: 1 });
            expect('s' in out).toBe(false);
            expect(out.a).toBe(1);
        })
    })

})

describe('JSON.stringify oracle and metamorphic properties', () => {

    // Enumerable-only, bigint-free input: JSON.stringify never throws on it and is the oracle for normalise.
    function oracleInput() {
        return {
            s: 'hi', n: 42, b: true, nul: null,
            date: new Date('2026-06-18T00:00:00.000Z'),
            map: new Map([['a', 1]]),
            set: new Set([1]),
            regex: /x/g,
            fn: () => 1,
            nested: { a: 1, d: new Date('2020-01-01T00:00:00.000Z'), f: () => 2 },
            arr: [1, () => 2, new Date('2021-01-01T00:00:00.000Z'), 'z'] as any[],
            url: new URL('https://example.com/p?x=1'),
            und: undefined,
        };
    }

    test('normalise of a bigint-free input equals JSON.parse(JSON.stringify(input))', () => {
        const out = cloneToJsonSafe(oracleInput(), { non_serialisable_handling: 'normalise' });
        expect(out).toEqual(JSON.parse(JSON.stringify(oracleInput())));
    })

    test('normalise output round-trips through JSON unchanged (always valid JSON)', () => {
        const out = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: 'normalise' });
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    })

    test('normalise is idempotent', () => {
        const once = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: 'normalise' });
        const twice = cloneToJsonSafe(once as any, { non_serialisable_handling: 'normalise' });
        expect(twice).toEqual(once);
    })

    test('drop and redact outputs are also valid JSON (never throw, round-trip)', () => {
        for (const mode of ['drop', 'redact'] as const) {
            const out = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: mode });
            expect(() => JSON.stringify(out)).not.toThrow();
            expect(JSON.parse(JSON.stringify(out))).toEqual(JSON.parse(JSON.stringify(out)));
        }
    })

    test('no bigint survives in any mode (the value JSON.stringify cannot serialise)', () => {
        for (const mode of ['drop', 'normalise', 'redact'] as const) {
            const out = cloneToJsonSafe(buildHazards(), { non_serialisable_handling: mode });
            expect(() => JSON.stringify(out)).not.toThrow();
        }
    })

    test('key-set monotonicity: keys(drop) ⊆ keys(normalise) ⊆ keys(redact)', () => {
        const keysFor = (mode: 'drop' | 'normalise' | 'redact') =>
            new Set(Object.keys(cloneToJsonSafe(buildHazards(), { non_serialisable_handling: mode }) as any));

        const drop = keysFor('drop');
        const normalise = keysFor('normalise');
        const redact = keysFor('redact');

        expect([...drop].every(k => normalise.has(k))).toBe(true);
        expect([...normalise].every(k => redact.has(k))).toBe(true);
        // redact strictly keeps more (it traces fn/sym that the others drop)
        expect(redact.size).toBeGreaterThan(drop.size);
    })
})

describe('value-retaining registry types blend a safe value in redact', () => {
    test('URL: drop omits, normalise gives its href, redact blends the href', () => {
        const u = () => ({ u: new URL('https://example.com/p?q=1') });
        expect('u' in cloneToJsonSafe(u())).toBe(false);
        expect((cloneToJsonSafe(u(), { non_serialisable_handling: 'normalise' }) as any).u).toBe('https://example.com/p?q=1');
        expect((cloneToJsonSafe(u(), { non_serialisable_handling: 'redact' }) as any).u).toBe('redact:URL:https://example.com/p?q=1');
    })
    test('URLSearchParams: normalise gives {} (as JSON does), redact blends the query', () => {
        const p = () => ({ q: new URLSearchParams('a=1&b=2') });
        expect((cloneToJsonSafe(p(), { non_serialisable_handling: 'normalise' }) as any).q).toEqual({});
        expect((cloneToJsonSafe(p(), { non_serialisable_handling: 'redact' }) as any).q).toBe('redact:URLSearchParams:a=1&b=2');
    })
    test('RegExp: normalise gives {} (as JSON does), redact blends the pattern', () => {
        const r = () => ({ r: /ab+c/gi });
        expect((cloneToJsonSafe(r(), { non_serialisable_handling: 'normalise' }) as any).r).toEqual({});
        expect((cloneToJsonSafe(r(), { non_serialisable_handling: 'redact' }) as any).r).toBe('redact:RegExp:/ab+c/gi');
    })
})

describe('objects carrying an unrecognised toJSON (e.g. Decimal, Luxon)', () => {
    // A Decimal-like value: own fields are its internals, plus a toJSON yielding the canonical string.
    class Decimalish {
        s = 1; e = 0; d = [15000000];
        toJSON() { return '1.5'; }
    }

    test('normalise honours toJSON like JSON.stringify — its canonical value, not its internals', () => {
        const out: any = cloneToJsonSafe({ n: new Decimalish() }, { non_serialisable_handling: 'normalise' });
        expect(out.n).toBe('1.5');
    })
    test('redact traces the constructor name without executing toJSON or leaking internals', () => {
        const out: any = cloneToJsonSafe({ n: new Decimalish() }, { non_serialisable_handling: 'redact' });
        expect(out.n).toBe('redact:Decimalish');
    })
    test('drop omits it entirely, so its internal {s,e,d} fields never leak', () => {
        const out: any = cloneToJsonSafe({ n: new Decimalish(), keep: 1 });
        expect('n' in out).toBe(false);
        expect(out.keep).toBe(1);
    })
    test('a plain class instance WITHOUT toJSON is still walked into its own fields', () => {
        class Point { x = 1; y = 2; dist() { return 0; } }
        const out: any = cloneToJsonSafe({ p: new Point() });
        expect(out.p).toEqual({ x: 1, y: 2 });
    })
})

describe('strip_sensitive_info is marker-aware', () => {
    const longToken = 'abcdefghijklmnopqrstuvwxyz0123456789'; // >20 chars → the token rule would mask it

    test('a redact marker keeps its prefix; only the blended detail is masked', () => {
        const out: any = cloneToJsonSafe(
            { u: new URL(`https://example.com/?token=${longToken}`) },
            { non_serialisable_handling: 'redact', strip_sensitive_info: true },
        );
        expect(out.u.startsWith('redact:URL:https://example.com')).toBe(true); // prefix + host intact
        expect(out.u).not.toContain(longToken);                                // the token inside the href was masked
    })
    test('a blended bigint keeps its prefix; only the digits are masked', () => {
        const out: any = cloneToJsonSafe(
            { n: 12345678901234567890n },
            { non_serialisable_handling: 'redact', strip_sensitive_info: true },
        );
        expect(out.n.startsWith('redact:bigint:')).toBe(true);
        expect(out.n).not.toContain('12345678901234567890');
    })
    test('an ordinary string that merely looks like a marker with an UNKNOWN type is fully masked', () => {
        // `reason` is not a known redact tag, so the whole value is treated as ordinary text — no prefix protection.
        const out: any = cloneToJsonSafe(
            { x: `redact:reason:${longToken}` },
            { non_serialisable_handling: 'redact', strip_sensitive_info: true },
        );
        expect(out.x).not.toContain(longToken);
        expect(out.x).not.toBe(`redact:reason:${longToken}`);
    })
    test('a real redact marker arriving as input data is protected (prefix kept, detail masked)', () => {
        const out: any = cloneToJsonSafe(
            { x: `redact:URL:https://example.com/?token=${longToken}` },
            { non_serialisable_handling: 'redact', strip_sensitive_info: true },
        );
        expect(out.x.startsWith('redact:URL:https://example.com')).toBe(true);
        expect(out.x).not.toContain(longToken);
    })
})

describe('classification never executes user code', () => {
    const modes = ['drop', 'normalise', 'redact'] as const;

    test('a Symbol.toStringTag getter is never invoked, and the object is not mis-typed', () => {
        for (const mode of modes) {
            let ran = false;
            const branded: any = { a: 1 };
            Object.defineProperty(branded, Symbol.toStringTag, { get() { ran = true; return 'Map'; } });

            const out: any = cloneToJsonSafe({ x: branded }, { non_serialisable_handling: mode });

            expect(ran).toBe(false);          // the toStringTag accessor was not read
            expect(out.x).toEqual({ a: 1 });  // treated as a plain object, not dropped as a fake Map
        }
    })

    test('a data-property Symbol.toStringTag cannot spoof a built-in into dropping real properties', () => {
        const branded: any = { a: 1, [Symbol.toStringTag]: 'Map' };
        expect((cloneToJsonSafe({ x: branded }) as any).x).toEqual({ a: 1 });
    })

    test('a prototype-spoofed Map is rejected by the internal-slot probe and recursed with its props intact', () => {
        const fake: any = Object.setPrototypeOf({ a: 1 }, Map.prototype); // `fake instanceof Map` is true
        expect((cloneToJsonSafe({ x: fake }) as any).x).toEqual({ a: 1 });
        expect((cloneToJsonSafe({ x: fake }, { non_serialisable_handling: 'redact' }) as any).x.a).toBe(1);
    })

    test('a genuine Map is still recognised by its internal slot', () => {
        const out: any = cloneToJsonSafe({ m: new Map([['a', 1]]) }, { non_serialisable_handling: 'redact' });
        expect(out.m).toBe('redact:Map');
    })

    test('a toJSON getter is never invoked while detecting toJSON, in any mode', () => {
        for (const mode of modes) {
            let ran = false;
            const obj: any = { a: 1 };
            Object.defineProperty(obj, 'toJSON', { enumerable: true, get() { ran = true; return () => 'x'; } });

            const out: any = cloneToJsonSafe({ x: obj }, { non_serialisable_handling: mode });

            expect(ran).toBe(false);     // the accessor was inspected by descriptor, not read
            expect(out.x.a).toBe(1);     // the object is recursed (the toJSON accessor is treated as a getter)
        }
    })

    test('a data-property toJSON method is honoured in normalise but not in drop/redact', () => {
        class Box { v = 5; toJSON() { return this.v; } }
        expect((cloneToJsonSafe({ b: new Box() }, { non_serialisable_handling: 'normalise' }) as any).b).toBe(5);
        expect('b' in cloneToJsonSafe({ b: new Box() })).toBe(false);
        expect((cloneToJsonSafe({ b: new Box() }, { non_serialisable_handling: 'redact' }) as any).b).toBe('redact:Box');
    })

    test('a constructor getter is never invoked when labelling a redacted toJSON object', () => {
        let ran = false;
        const proto: any = {};
        Object.defineProperty(proto, 'constructor', { get() { ran = true; return function Evil() { }; } });
        const obj = Object.create(proto);
        obj.toJSON = () => 'x'; // own data-property method → routed through the toJSON branch

        const out: any = cloneToJsonSafe({ o: obj }, { non_serialisable_handling: 'redact' });

        expect(ran).toBe(false);
        expect(out.o).toBe('redact:Object');
    })
})