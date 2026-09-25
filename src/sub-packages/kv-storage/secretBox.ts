/**
 * Resources:
 *
 * https://www.youtube.com/watch?v=lbt2_M1hZeg
 */

const ITERATIONS = 147_000;
const SALT_BYTES = 16;
const IV_BYTES = 32;
const HEADER_BYTES = SALT_BYTES + IV_BYTES;
/** The authentication tag AES-GCM appends to every ciphertext. */
const TAG_BYTES = 16;

/**
 * The most keys a box keeps. Values written by builds that gave every value its own salt need
 * one key each; the cap bounds the memory they take. The box's own key is never dropped.
 */
const MAX_KEYS = 64;

/** Encrypts and decrypts strings with a password. */
export type SecretBox = {
    /**
     * Encrypts `text`.
     * @returns Base64 of `salt (16 bytes) | IV (32 bytes) | AES-GCM ciphertext`.
     */
    seal(text: string): Promise<string>;
    /**
     * Decrypts a sealed value, whichever box (or build) sealed it with the same password.
     * @returns The original text. Rejects if the value is malformed, was sealed with another
     * password, or has been tampered with.
     */
    open(sealed: string): Promise<string>;
};

/**
 * Creates a box that encrypts strings with `password`, using AES-GCM under a key derived from
 * the password with PBKDF2 (SHA-256, 147,000 iterations).
 *
 * Deriving a key is deliberately slow, so the box derives as few as it can: one for everything
 * it seals, and one for each other salt it opens values under. Every sealed value still gets a
 * fresh random IV.
 *
 * @param password The secret everything is encrypted with.
 * @returns A {@link SecretBox}.
 *
 * @example
 * const box = createSecretBox(password);
 * const sealed = await box.seal('{"token":"abc"}');
 * await box.open(sealed); // '{"token":"abc"}'
 *
 * @remarks
 * A sealed value carries its salt, so any box with the same password opens it: boxes created
 * by other stores, pages or builds, including builds that gave every value a salt of its own.
 *
 * Sharing one salt across a box's values costs an attacker nothing: each password guess still
 * needs a full derivation against a random salt, and one key with a random IV per value is how
 * AES-GCM is meant to be used.
 *
 * Keys are derived on first use. A key being derived is shared by every call that needs it
 * meanwhile, and a failed derivation is not kept, so the next call tries again.
 */
export function createSecretBox(password: string): SecretBox {
    const ownSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const ownSaltId = toHex(ownSalt);
    const keys = new Map<string, Promise<CryptoKey>>();

    const keyFor = (salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
        const id = toHex(salt);
        const known = keys.get(id);
        if (known) return known;

        const key = deriveAesKey(password, salt);
        keys.set(id, key);
        key.catch(() => {
            if (keys.get(id) === key) keys.delete(id);
        });
        if (keys.size > MAX_KEYS) {
            // Map order is insertion order, so this finds the oldest.
            const oldest = [...keys.keys()].find(known => known !== ownSaltId);
            if (oldest) keys.delete(oldest);
        }
        return key;
    };

    return {
        async seal(text) {
            const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
            const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(ownSalt), new TextEncoder().encode(text));
            const sealed = new Uint8Array(HEADER_BYTES + ciphertext.byteLength);
            sealed.set(ownSalt, 0);
            sealed.set(iv, SALT_BYTES);
            sealed.set(new Uint8Array(ciphertext), HEADER_BYTES);
            return toBase64(sealed);
        },

        async open(sealedBase64) {
            const sealed = fromBase64(sealedBase64);
            // Refused before any key is derived for it.
            if (sealed.byteLength < HEADER_BYTES + TAG_BYTES) throw new Error('The value is not a sealed value.');
            const salt = sealed.slice(0, SALT_BYTES);
            const iv = sealed.slice(SALT_BYTES, HEADER_BYTES);
            const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFor(salt), sealed.slice(HEADER_BYTES));
            return new TextDecoder().decode(text);
        }
    };
}

async function deriveAesKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false, // Not exportable
        ['encrypt', 'decrypt']
    );
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/** Encodes in chunks, since passing a large value's bytes as arguments at once overflows the stack. */
function toBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return globalThis.btoa(binary);
}

const fromBase64 = (base64: string) => Uint8Array.from(globalThis.atob(base64), char => char.charCodeAt(0));
