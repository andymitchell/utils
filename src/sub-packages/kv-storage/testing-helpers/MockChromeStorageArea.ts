/**
 * An in-memory stand-in for a Chrome extension storage area, for tests that need one without
 * running inside a browser.
 *
 * It implements the parts of the real area that storage adapters actually use — reading,
 * writing, removing, listing keys, and change notifications — and refuses the rest loudly, so
 * a test relying on unimplemented behaviour fails rather than quietly reading nothing.
 *
 * Every method supports both the promise and the callback form, because the real area does and
 * an adapter is free to use either.
 */
export class MockChromeStorageArea implements chrome.storage.StorageArea {

    private storage: { [key: string]: any } = {};

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
    getBytesInUse(): void | Promise<number> {
        throw new Error("Method not implemented.")
    }

    setAccessLevel(accessOptions: { accessLevel: `${chrome.storage.AccessLevel}` }): Promise<void>;
    setAccessLevel(accessOptions: { accessLevel: `${chrome.storage.AccessLevel}` }, callback: () => void): void;
    setAccessLevel(): void | Promise<void> {
        throw new Error("Method not implemented.")
    }

    set<T = { [key: string]: any }>(items: Partial<T>): Promise<void>;
    set<T = { [key: string]: any }>(items: Partial<T>, callback: () => void): void;
    set(items: { [key: string]: any }, callback?: () => void): void | Promise<void> {
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

    /**
     * Resolve the several ways an area may be asked what it holds.
     *
     * `null` and `undefined` both mean everything. A lone key means just that one. An object
     * means its keys, whose values are defaults the real area would fall back to.
     */
    #read(keys: unknown): { [key: string]: any } {
        if (keys === null || keys === undefined) return { ...this.storage };

        const wanted = typeof keys === 'string'
            ? [keys]
            : Array.isArray(keys) ? keys : Object.keys(keys as object);

        const found: { [key: string]: any } = {};
        for (const key of wanted) found[key] = this.storage[key];
        return found;
    }
}

/** Hand a result back the way the caller asked for it, by callback or by promise. */
function settle<T>(value: T, callback?: (value: T) => void): void | Promise<T> {
    if (callback) {
        callback(value);
        return;
    }
    return Promise.resolve(value);
}
