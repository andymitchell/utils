/** Options for a {@link MockChromeStorageArea}. */
export type MockChromeStorageAreaOptions = {
    /**
     * The most space the area holds, in bytes as `getBytesInUse` counts them. A write that would
     * take it past this is refused, as a browser refuses one past its `QUOTA_BYTES`.
     * @default Infinity
     */
    quota_bytes?: number
}

const DEFAULT_OPTIONS: Readonly<Required<MockChromeStorageAreaOptions>> = Object.freeze({
    quota_bytes: Infinity
});

/**
 * An in-memory stand-in for a Chrome extension storage area, for tests that need one without
 * running inside a browser.
 *
 * It implements the parts of the real area that storage adapters actually use — reading,
 * writing, removing, listing keys, counting bytes in use, and change notifications — and refuses
 * the rest loudly, so a test relying on unimplemented behaviour fails rather than quietly reading
 * nothing.
 *
 * Every method supports both the promise and the callback form, because the real area does and
 * an adapter is free to use either.
 *
 * @example
 * const area = new MockChromeStorageArea({ quota_bytes: 10 });
 * await area.set({ big: 'more than ten bytes' }); // rejects: "QUOTA_BYTES quota exceeded"
 *
 * @remarks
 * A write refused for quota rejects in the promise form, with the message a browser gives. In
 * the callback form it throws instead, because a browser reports it through
 * `chrome.runtime.lastError`, which this stand-in does not set.
 */
export class MockChromeStorageArea implements chrome.storage.StorageArea {

    private storage: { [key: string]: any } = {};

    readonly #options: Readonly<Required<MockChromeStorageAreaOptions>>;

    constructor(options?: MockChromeStorageAreaOptions) {
        this.#options = { ...DEFAULT_OPTIONS, ...options };
    }

    #changeListeners: ((changes: { [key: string]: chrome.storage.StorageChange }) => void)[] = [];

    // @ts-ignore Only the listener methods are exercised; the rest of the event surface is unused here.
    onChanged: chrome.storage.StorageArea['onChanged'] = {
        addListener: (callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
            this.#changeListeners.push(callback);
        },
        removeListener: (callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
            this.#changeListeners = this.#changeListeners.filter(x => x !== callback);
        }
    }

    getBytesInUse<T = { [key: string]: any }>(keys?: keyof T | Array<keyof T> | null): Promise<number>;
    getBytesInUse<T = { [key: string]: any }>(callback: (bytesInUse: number) => void): void;
    getBytesInUse<T = { [key: string]: any }>(keys: keyof T | Array<keyof T> | null | undefined, callback: (bytesInUse: number) => void): void;
    getBytesInUse(keysOrCallback?: unknown, maybeCallback?: (bytesInUse: number) => void): void | Promise<number> {
        const callback = typeof keysOrCallback === 'function' ? keysOrCallback as (bytesInUse: number) => void : maybeCallback;
        const keys = typeof keysOrCallback === 'function' ? null : keysOrCallback;

        return settle(bytesInUse(this.storage, this.#keysNamed(keys)), callback);
    }

    setAccessLevel(accessOptions: { accessLevel: `${chrome.storage.AccessLevel}` }): Promise<void>;
    setAccessLevel(accessOptions: { accessLevel: `${chrome.storage.AccessLevel}` }, callback: () => void): void;
    setAccessLevel(): void | Promise<void> {
        throw new Error("Method not implemented.")
    }

    set<T = { [key: string]: any }>(items: Partial<T>): Promise<void>;
    set<T = { [key: string]: any }>(items: Partial<T>, callback: () => void): void;
    set(items: { [key: string]: any }, callback?: () => void): void | Promise<void> {
        const after = { ...this.storage, ...items };
        if (bytesInUse(after, Object.keys(after)) > this.#options.quota_bytes) {
            if (callback) throw new Error("MockChromeStorageArea cannot report a write refused for quota by callback, as a browser reports it through chrome.runtime.lastError. Use the promise form.");
            return Promise.reject(new Error("QUOTA_BYTES quota exceeded"));
        }

        const changes: { [key: string]: chrome.storage.StorageChange } = {};
        for (const key of Object.keys(items)) {
            this.storage[key] = items[key];
            changes[key] = { newValue: items[key] };
        }

        this.#changeListeners.forEach(listener => listener(changes));

        return settle(undefined, callback);
    }

    get<T = { [key: string]: unknown }>(keys?: NoInfer<keyof T> | Array<NoInfer<keyof T>> | Partial<NoInfer<T>> | null): Promise<T>;
    get<T = { [key: string]: unknown }>(callback: (items: T) => void): void;
    get<T = { [key: string]: unknown }>(keys: NoInfer<keyof T> | Array<NoInfer<keyof T>> | Partial<NoInfer<T>> | null | undefined, callback: (items: T) => void): void;
    get(keysOrCallback?: unknown, maybeCallback?: (items: any) => void): void | Promise<any> {
        const callback = typeof keysOrCallback === 'function' ? keysOrCallback as (items: any) => void : maybeCallback;
        const keys = typeof keysOrCallback === 'function' ? null : keysOrCallback;

        return settle(this.#read(keys), callback);
    }

    remove<T = { [key: string]: any }>(keys: keyof T | Array<keyof T>): Promise<void>;
    remove<T = { [key: string]: any }>(keys: keyof T | Array<keyof T>, callback: () => void): void;
    remove(keys: string | string[], callback?: () => void): void | Promise<void> {
        for (const key of (Array.isArray(keys) ? keys : [keys])) {
            this.#changeListeners.forEach(listener => listener({ [key]: { newValue: undefined, oldValue: this.storage[key] } }));
            delete this.storage[key];
        }

        return settle(undefined, callback);
    }

    clear(): Promise<void>;
    clear(callback: () => void): void;
    clear(callback?: () => void): void | Promise<void> {
        this.storage = {};

        return settle(undefined, callback);
    }

    getKeys(): Promise<string[]>;
    getKeys(callback: (keys: string[]) => void): void;
    getKeys(callback?: (keys: string[]) => void): void | Promise<string[]> {
        return settle(Object.keys(this.storage), callback);
    }

    #read(keys: unknown): { [key: string]: any } {
        const found: { [key: string]: any } = {};
        for (const key of this.#keysNamed(keys)) found[key] = this.storage[key];
        return found;
    }

    /**
     * Resolve the several ways an area may be asked about what it holds.
     *
     * `null` and `undefined` both mean everything. A lone key means just that one. An object
     * means its keys, whose values are defaults the real area would fall back to.
     */
    #keysNamed(keys: unknown): string[] {
        if (keys === null || keys === undefined) return Object.keys(this.storage);
        if (typeof keys === 'string') return [keys];
        return Array.isArray(keys) ? keys : Object.keys(keys as object);
    }
}

const utf8 = new TextEncoder();

/** The space `keys` take in `storage`, as a browser counts it: each key plus its value as JSON, in UTF-8 bytes. */
function bytesInUse(storage: { [key: string]: any }, keys: string[]): number {
    return keys
        .filter(key => key in storage)
        .reduce((total, key) => total + utf8.encode(key).length + utf8.encode(JSON.stringify(storage[key])).length, 0);
}

/** Hand a result back the way the caller asked for it, by callback or by promise. */
function settle<T>(value: T, callback?: (value: T) => void): void | Promise<T> {
    if (callback) {
        callback(value);
        return;
    }
    return Promise.resolve(value);
}
