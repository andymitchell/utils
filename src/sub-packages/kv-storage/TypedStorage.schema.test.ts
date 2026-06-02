import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MemoryStorage } from './adapters/MemoryStorage.ts';
import { TypedStorage } from './TypedStorage.ts';
import { SecureTypedStorage } from './SecureTypedStorage.ts';

/**
 * Anti-regression lock-down for the typed kv-storage schema-failure contract.
 *
 * Intent: a schema-violating write must throw, and the thrown error must carry a
 * `schemaFailSummary` of `{message, path}` entries whose `path` pinpoints the
 * offending field. The exact path FORMAT (dotted for nested keys, bracketed for
 * array indices) is the contract the prettify-zod error formatter feeds into here,
 * and it must be preserved across the Zod 4 migration (native `toDotPath` produces
 * the same shape). Assertions target structure and path values, never message text.
 */
describe('typed kv-storage schema enforcement', () => {
    describe('TypedStorage rejects writes that violate the schema', () => {
        it('throws, and reports the offending top-level field in the failure summary', async () => {
            const store = new TypedStorage<{ name: string }>(
                new MemoryStorage(),
                z.object({ name: z.string() }),
            );

            let cause: any;
            try {
                // @ts-expect-error wrong shape on purpose
                await store.set('k', { name: 123 });
            } catch (e) {
                cause = (e as Error).cause;
            }

            expect(Array.isArray(cause?.schemaFailSummary)).toBe(true);
            expect(cause.schemaFailSummary.length).toBeGreaterThan(0);
            const [first] = cause.schemaFailSummary;
            expect(typeof first.message).toBe('string');
            expect(first.message.length).toBeGreaterThan(0);
            expect(first.path).toBe('name');
        });

        it('formats nested object paths with dots', async () => {
            const store = new TypedStorage<{ a: { b: string } }>(
                new MemoryStorage(),
                z.object({ a: z.object({ b: z.string() }) }),
            );

            let cause: any;
            try {
                // @ts-expect-error wrong shape on purpose
                await store.set('k', { a: { b: 9 } });
            } catch (e) {
                cause = (e as Error).cause;
            }

            expect(cause.schemaFailSummary[0].path).toBe('a.b');
        });

        it('formats array-index paths with brackets', async () => {
            const store = new TypedStorage<{ items: { name: string }[] }>(
                new MemoryStorage(),
                z.object({ items: z.array(z.object({ name: z.string() })) }),
            );

            let cause: any;
            try {
                // @ts-expect-error wrong shape on purpose
                await store.set('k', { items: [{ name: 'ok' }, { name: 5 }] });
            } catch (e) {
                cause = (e as Error).cause;
            }

            expect(cause.schemaFailSummary[0].path).toBe('items[1].name');
        });
    });

    describe('TypedStorage protects reads against schema mismatches', () => {
        it('returns undefined when the stored value does not satisfy the schema', async () => {
            const raw = new MemoryStorage();
            const store = new TypedStorage<{ name: string }>(raw, z.object({ name: z.string() }));

            // Corrupt the underlying store out-of-band: valid JSON, wrong shape.
            await raw.set('k', JSON.stringify({ name: 123 }));

            expect(await store.get('k')).toBeUndefined();
        });
    });

    describe('SecureTypedStorage shares the same schema-failure contract', () => {
        it('throws with a field-path failure summary', async () => {
            const store = new SecureTypedStorage<{ id: number }>(
                new MemoryStorage(),
                'pw',
                z.object({ id: z.number() }),
            );

            let cause: any;
            try {
                // @ts-expect-error wrong shape on purpose
                await store.set('k', { id: 'nope' });
            } catch (e) {
                cause = (e as Error).cause;
            }

            expect(cause.schemaFailSummary[0].path).toBe('id');
            expect(typeof cause.schemaFailSummary[0].message).toBe('string');
        });
    });
});
