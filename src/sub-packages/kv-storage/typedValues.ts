import type { ZodType } from "zod";

/**
 * What a typed store makes of a stored JSON value: the value, `undefined` when it fails the
 * schema, or the error that stopped it being read.
 */
export type DecodedValue<T> = { ok: true, value: T | undefined } | { ok: false, error: Error };

/**
 * Turns a stored JSON string back into a value, checking it against `schema`. Never throws.
 *
 * @param json The string as stored.
 * @param schema When given, a value that does not match it decodes to `undefined`.
 * @returns `{ ok: true, value }` with the value as stored (`undefined` for a schema failure),
 * or `{ ok: false, error }` when `json` is not JSON or checking it throws (e.g. a schema's
 * transform throws on it).
 *
 * @example
 * decodeTypedValue('{"name":"Ada"}', z.object({ name: z.string() })); // { ok: true, value: { name: 'Ada' } }
 * decodeTypedValue('{"age":2}', z.object({ name: z.string() }));      // { ok: true, value: undefined }
 * decodeTypedValue('not json');                                        // { ok: false, error: SyntaxError }
 * decodeTypedValue('"plain text"', z.string().transform(text => JSON.parse(text))); // { ok: false, error: SyntaxError }
 */
export function decodeTypedValue<T>(json: string, schema?: ZodType<T>): DecodedValue<T> {
    try {
        const value: unknown = JSON.parse(json);
        // Escape hatch: the value is returned as stored, not as the schema would output it (no stripped
        // keys or transforms). Without a schema it is trusted to be a T, as a store of T wrote it.
        if (schema && !schema.safeParse(value).success) return { ok: true, value: undefined };
        return { ok: true, value: value as T };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}

/**
 * Reads the value of every key at once, rather than one after another.
 *
 * @param keys The keys to read.
 * @param get Reads one key's value; `undefined` when it has none.
 * @returns Each key with a value, mapped to it. Keys whose value is `undefined` (removed since
 * they were listed, or failing a schema) are left out. Rejects if any read rejects.
 */
export async function readAll<T>(keys: string[], get: (key: string) => Promise<T | undefined>): Promise<Record<string, T>> {
    const values = await Promise.all(keys.map(key => get(key)));
    return Object.fromEntries(keys.flatMap((key, i) => {
        const value = values[i];
        return value === undefined ? [] : [[key, value] as const];
    }));
}
