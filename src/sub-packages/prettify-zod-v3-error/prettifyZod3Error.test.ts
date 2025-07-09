import { describe, it, expect } from 'vitest';
import { z, ZodError } from 'zod';
import { prettifyZod3ErrorAsArray } from './prettifyZod3Error.ts';

describe('prettifyZod3ErrorAsArray', () => {
    it('should return an empty array if there are no issues', () => {
        const error = new ZodError([]);
        expect(prettifyZod3ErrorAsArray(error)).toEqual([]);
    });

    it('should handle a simple invalid type error at the root', () => {
        const schema = z.string();
        const result = schema.safeParse(123);
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(['✖ Expected string, received number']);
        }
    });

    it('should handle invalid types in a flat object', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        const result = schema.safeParse({ name: 123, age: '25' });
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            // Use arrayContaining because Zod issue order is not guaranteed
            expect(prettyErrors).toEqual(expect.arrayContaining([
                '✖ Expected string, received number\n  → at name',
                '✖ Expected number, received string\n  → at age',
            ]));
            expect(prettyErrors.length).toBe(2);
        }
    });

    it('should handle unrecognized keys on a strict object', () => {
        const schema = z.object({ name: z.string() }).strict();
        const result = schema.safeParse({ name: 'John Doe', extraKey: 'some value' });
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(["✖ Unrecognized key(s) in object: 'extraKey'"]);
        }
    });


    it('should handle unrecognized keys on a strict nested object', () => {
        const schema = z.object({ name: z.string(), child: z.object({name: z.string()}).strict() }).strict();
        const result = schema.safeParse({ name: 'John Doe', child: {name: 'Alice',  extraKey: 'some value'} });
        expect(result.success).toBe(false);
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(["✖ Unrecognized key(s) in object: 'extraKey'\n  → at child"]);
        }
    });

    it('should handle errors in a nested object', () => {
        const schema = z.object({
            user: z.object({ profile: z.object({ name: z.string() }) }),
        });
        const result = schema.safeParse({ user: { profile: { name: null } } });
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(['✖ Expected string, received null\n  → at user.profile.name']);
        }
    });

    it('should handle errors in an array of primitives', () => {
        const schema = z.object({ favoriteNumbers: z.array(z.number()) });
        const result = schema.safeParse({ favoriteNumbers: [1, 'two', 3, 'four'] });
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(expect.arrayContaining([
                '✖ Expected number, received string\n  → at favoriteNumbers[1]',
                '✖ Expected number, received string\n  → at favoriteNumbers[3]',
            ]));
            expect(prettyErrors.length).toBe(2);
        }
    });

    it('should handle errors in an array of objects', () => {
        const schema = z.object({
            users: z.array(z.object({ id: z.number() })),
        });
        const result = schema.safeParse({ users: [{ id: 1 }, { id: '2' }] });
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(['✖ Expected number, received string\n  → at users[1].id']);
        }
    });

    it('should use the default message for other error types like `too_small`', () => {
        const schema = z.string().min(5, 'String must be at least 5 characters long');
        const result = schema.safeParse('test');
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(['✖ String must be at least 5 characters long']);
        }
    });

    it('should handle a complex combination of nested objects, arrays, and various errors', () => {
        const complexSchema = z.object({
            username: z.string().min(3),
            contact: z.object({
                email: z.string().email(),
                address: z.object({
                    city: z.string(),
                    zip: z.number(),
                }).strict(),
            }),
            tags: z.array(z.object({ id: z.number(), value: z.string() })),
            matrix: z.array(z.array(z.boolean())),
        });

        const invalidData = {
            username: 'a', // too_small
            contact: {
                email: 'not-an-email', // invalid_string (email)
                address: {
                    city: 123, // invalid_type
                    zip: '12345', // invalid_type
                    country: 'USA', // unrecognized_key
                },
            },
            tags: [
                { id: 1, value: 'tag1' },
                { id: '2', value: 123 }, // invalid_type on id, invalid_type on value
            ],
            matrix: [
                [true, false],
                [true, 'false'], // invalid_type in nested array
            ],
        };

        const result = complexSchema.safeParse(invalidData);
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(expect.arrayContaining([
                '✖ String must contain at least 3 character(s)\n  → at username',
                '✖ Invalid email\n  → at contact.email',
                '✖ Unrecognized key(s) in object: \'country\'\n  → at contact.address',
                '✖ Expected string, received number\n  → at contact.address.city',
                '✖ Expected number, received string\n  → at contact.address.zip',
                '✖ Expected number, received string\n  → at tags[1].id',
                '✖ Expected string, received number\n  → at tags[1].value',
                '✖ Expected boolean, received string\n  → at matrix[1][1]',
            ]));
            expect(prettyErrors.length).toBe(8);
        }
    });

    it('should handle a deep nesting of object/array/object/array/object', () => {
        const complexSchema = z.object({
            tags: z.array(z.object({ id: z.number(), subTags: z.array(z.object({id: z.number()})) })),
        });

        const invalidData = {
            tags: [
                { id: 1, subTags: [{id: 1}, {id: '2'}, {id: 3}] }, // invalid type of id
            ]
        };

        const result = complexSchema.safeParse(invalidData);
        if (!result.success) {
            const prettyErrors = prettifyZod3ErrorAsArray(result.error);
            expect(prettyErrors).toEqual(expect.arrayContaining([
                '✖ Expected number, received string\n  → at tags[0].subTags[1].id'
            ]));
            expect(prettyErrors.length).toBe(1);
        }
    });

});