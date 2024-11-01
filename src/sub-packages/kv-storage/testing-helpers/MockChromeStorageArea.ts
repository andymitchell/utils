export class MockChromeStorageArea implements chrome.storage.StorageArea {
    getBytesInUse(callback: (bytesInUse: number) => void): void
    getBytesInUse(keys?: string | string[] | null | undefined): Promise<number>
    getBytesInUse(keys: string | string[] | null, callback: (bytesInUse: number) => void): void
    getBytesInUse(): void | Promise<number> {
        throw new Error("Method not implemented.")
    }
    setAccessLevel(accessOptions: { accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" | "TRUSTED_CONTEXTS" }): Promise<void>
    setAccessLevel(accessOptions: { accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" | "TRUSTED_CONTEXTS" }, callback: () => void): void
    setAccessLevel(): void | Promise<void> {
        throw new Error("Method not implemented.")
    }

    #changeListeners:((changes: {[key: string]: chrome.storage.StorageChange}) => void)[] = [];
    
    
    // @ts-ignore Only testing, don't care about the rest
    onChanged: chrome.storage.StorageAreaChangedEvent = {
        addListener: (callback) => {
            this.#changeListeners.push(callback);
        },
        removeListener: (callback) => {
            this.#changeListeners = this.#changeListeners.filter(x => x !== callback);
        }
    }

    private storage: { [key: string]: any } = {};

    async set(items: { [key: string]: any }): Promise<void> {
        const changes:{[key: string]: chrome.storage.StorageChange} = {};
        for (const key in items) {
            if (items.hasOwnProperty(key)) {
                this.storage[key] = items[key];
                changes[key] = {newValue: items[key]}
            }
        }

        this.#changeListeners.forEach(x => x(changes));
    }

    async get(keys: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }> {
        if (keys === null) {
            return this.storage;
        }

        let result: { [key: string]: any } = {};

        if (typeof keys === 'string') {
            result[keys] = this.storage[keys];
        } else if (Array.isArray(keys)) {
            for (const key of keys) {
                result[key] = this.storage[key];
            }
        } else if (typeof keys === 'object') {
            for (const key in keys) {
                if (keys.hasOwnProperty(key)) {
                    result[key] = this.storage[key];
                }
            }
        }

        return result;
    }

    async remove(keys: string | string[]): Promise<void> {
        if (typeof keys === 'string') {
            this.#changeListeners.forEach(x => x({[keys]: {newValue: undefined, oldValue: this.storage[keys]}}));
            delete this.storage[keys];
            
        } else if (Array.isArray(keys)) {
            for (const key of keys) {
                this.#changeListeners.forEach(x => x({[key]: {newValue: undefined, oldValue: this.storage[key]}}));
                delete this.storage[key];
            }
        }
    }

    async clear(): Promise<void> {
        this.storage = {};
    }
}