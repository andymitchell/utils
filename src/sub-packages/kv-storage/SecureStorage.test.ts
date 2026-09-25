import { vi } from "vitest";
import { z } from "zod";
import { MemoryStorage } from "./adapters/MemoryStorage.ts";
import { SecureTypedStorage } from "./SecureTypedStorage.ts"
import { commonNamespacedTypedTests } from "./testing-helpers/commonNamespacedTypedTests.ts";

const PASSWORD = '123';

/**
 * Values stored by a build that gave every value a salt of its own, under the namespace 'legacy'
 * with the password '123'.
 */
const STORED_WITH_A_SALT_PER_VALUE: Record<string, string> = {
    "legacy|:|greeting": "KqgNJijyYAoGxBkI9eZrkS945PnrqpDYK4W6EzAAmPNgQpOe6AikxYQ4ZqIG17lVvVNhH2MhndP9WJSzkcTAlojDuISkawQ=",
    "legacy|:|profile": "nBaMXGpsWISsM7iXjSoH/hdO0IotrAbUmZ0lSD033INJjMhO8VntZ/twYOZctuKHC89prJHcP9rvWMN/t/WgSJtBLcVNCLOolR69nqNsIL9ZhJ2JYJjFLPgG33dSaUY="
};

/**
 * Opens a stored value the way every version reads it: the key is derived from the password and
 * the salt at the front of the value, and the value is decrypted with the IV that follows.
 */
async function openAsEveryVersionDoes(stored: string, password: string): Promise<string> {
    const bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const [salt, iv, data] = [bytes.slice(0, 16), bytes.slice(16, 48), bytes.slice(48)];
    const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 147_000 }, passwordKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

/**
 * Counts every key derived from a password (the slow step of reading or writing a value) from
 * now on. Passes through to the real implementation.
 */
function countKeyDerivations(): () => number {
    const spies = [vi.spyOn(crypto.subtle, 'deriveKey'), vi.spyOn(crypto.subtle, 'deriveBits')];
    return () => spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
}

async function storeValues(adapter: MemoryStorage, count: number): Promise<string[]> {
    const writer = new SecureTypedStorage<string>(adapter, PASSWORD, undefined, 'ns');
    const keys = Array.from({ length: count }, (_, i) => `key${i}`);
    for (const key of keys) await writer.set(key, `value of ${key}`);
    return keys;
}

describe('SecureTypedStorage', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    commonNamespacedTypedTests((namespace, adapter, schema) => new SecureTypedStorage(adapter ?? new MemoryStorage(), PASSWORD, schema, namespace), {include_schema: true});


    it("includes schema details", async () => {
        const store = new SecureTypedStorage(new MemoryStorage(), PASSWORD, z.object({id: z.number()}), 'abc')

        let error:Error | undefined;

        try {
            const result = await store.set('k1', {
                // @ts-expect-error
                id: '1'
            });
        } catch(e) {
            if( e instanceof Error ) error = e;
        }


        expect(error).toBeDefined();

        const cause:any = error?.cause;
        expect(cause?.schemaFailSummary).toBeDefined()
        expect(cause?.schemaFailSummary?.[0]?.path).toBe('id');
    })

    describe('the cost of the password', () => {

        test('a store derives its key once, however many values it writes, reads back and hears about', async () => {
            const derivations = countKeyDerivations();
            const store = new SecureTypedStorage<string>(new MemoryStorage(), PASSWORD, undefined, 'ns');
            const keys = Array.from({ length: 5 }, (_, i) => `key${i}`);
            const heard: string[] = [];
            const heardAll = new Promise<void>(resolve => store.events.on('CHANGE', event => {
                heard.push(event.key);
                if (heard.length === keys.length) resolve();
            }));

            for (const key of keys) await store.set(key, `value of ${key}`);
            for (let round = 0; round < 4; round++) {
                for (const key of keys) expect(await store.get(key)).toBe(`value of ${key}`);
            }
            await heardAll;

            expect(derivations()).toBe(1);
        });

        test('a store reading values another store wrote derives once for that writer', async () => {
            const adapter = new MemoryStorage();
            const keys = await storeValues(adapter, 5);
            const derivations = countKeyDerivations();

            const reader = new SecureTypedStorage<string>(adapter, PASSWORD, undefined, 'ns');
            for (const key of keys) expect(await reader.get(key)).toBe(`value of ${key}`);

            expect(derivations()).toBe(1);
        });

        test('reads made at the same moment share one derivation', async () => {
            const adapter = new MemoryStorage();
            const keys = await storeValues(adapter, 5);
            const derivations = countKeyDerivations();

            const reader = new SecureTypedStorage<string>(adapter, PASSWORD, undefined, 'ns');
            const values = await Promise.all(keys.map(key => reader.get(key)));

            expect(values).toEqual(keys.map(key => `value of ${key}`));
            expect(derivations()).toBe(1);
        });

        test("a store nobody listens to does no work for other stores' writes", async () => {
            const adapter = new MemoryStorage();
            new SecureTypedStorage<string>(adapter, PASSWORD, undefined, 'ns');
            const derivations = countKeyDerivations();

            await storeValues(adapter, 5);
            await new Promise(resolve => setTimeout(resolve, 0));

            // The writer's own key, and nothing for the idle store.
            expect(derivations()).toBe(1);
        });
    });

    describe('what is stored', () => {

        test('reads values stored by builds that gave every value a salt of its own', async () => {
            const adapter = new MemoryStorage();
            for (const [key, value] of Object.entries(STORED_WITH_A_SALT_PER_VALUE)) await adapter.set(key, value);

            const store = new SecureTypedStorage<unknown>(adapter, PASSWORD, undefined, 'legacy');

            expect(await store.get('greeting')).toBe('hello');
            expect(await store.get('profile')).toEqual({ name: 'Ada', tags: ['x', 'y'] });
        });

        test('writes values that every version can read', async () => {
            const adapter = new MemoryStorage();
            const store = new SecureTypedStorage<unknown>(adapter, PASSWORD, undefined, 'ns');
            const values: Record<string, unknown> = { a: 'text', b: { nested: [1, 2] }, c: 0 };

            for (const [key, value] of Object.entries(values)) await store.set(key, value);

            for (const [key, value] of Object.entries(values)) {
                const stored = await adapter.get(`ns|:|${key}`);
                expect(JSON.parse(await openAsEveryVersionDoes(stored!, PASSWORD))).toEqual(value);
            }
        });

        test('stores and reads back a large value', async () => {
            const store = new SecureTypedStorage<string>(new MemoryStorage(), PASSWORD, undefined, 'ns');
            const large = 'x'.repeat(1_000_000);

            await store.set('large', large);

            expect(await store.get('large')).toBe(large);
        });

        test('never stores two values under the same IV, even when they are equal', async () => {
            const adapter = new MemoryStorage();
            const store = new SecureTypedStorage<string>(adapter, PASSWORD, undefined, 'ns');

            for (let i = 0; i < 10; i++) await store.set(`key${i}`, 'same value');

            const ivs = new Set<string>();
            for (const key of await adapter.getAllKeys()) {
                ivs.add(atob((await adapter.get(key))!).slice(16, 48));
            }
            expect(ivs.size).toBe(10);
        });

        test('a store with another password cannot read the values', async () => {
            const adapter = new MemoryStorage();
            const keys = await storeValues(adapter, 1);

            const intruder = new SecureTypedStorage<string>(adapter, 'not the password', undefined, 'ns');

            await expect(intruder.get(keys[0]!)).rejects.toThrow();
        });
    });
})
