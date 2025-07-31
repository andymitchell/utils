







export function midnight(nowMs?: number): Date {
    if (!nowMs) nowMs = Date.now();
    const d = new Date(nowMs);
    d.setHours(0);
    d.setMinutes(0);
    d.setMilliseconds(0);
    return d;
}




export type PromiseWithTrigger<T = any> = {
    promise: Promise<T>,
    trigger: ((value: T | PromiseLike<T>) => void)
}
/**
 * Creates a promise that can be resolved externally by calling its `trigger` function.
 * Optionally rejects with a timeout if not triggered within the specified duration.
 *
 * This is useful when you need to defer resolution of a promise until some external event or callback
 * occurs, and optionally guard against hanging by specifying a timeout.
 *
 * @template T
 * @param {number} [timeoutMs] - Maximum time in milliseconds to wait for the trigger before rejecting.
 *                                If omitted, the promise will never time out.
 * @returns An object containing:
 * - `promise`: The Promise<T> that will resolve when `trigger` is called.
 * - `trigger(value)`: A function to resolve the promise. Throws an error if the promise is not yet set up.
 * 
 *
 * @throws {Error} If time out occurs. Has a cause of `{cause: 'timeout'}`
 *
 * @example
 * // Example 1: Manually resolving
 * const pwt = promiseWithTrigger<number>();
 * setTimeout(() => pwt.trigger(42), 100); // external event after 100ms
 * const value = await pwt.promise; // value = 42
 *
 * @example
 * // Example 2: Automatic timeout
 * const { promise, trigger } = promiseWithTrigger<string>(500);
 * promise
 *   .then(value => console.log('Resolved:', value)) // 500
 *   .catch(err => console.error('Error:', err.message)); // logs 'Error: Timed out' after 500ms
 */
export function promiseWithTrigger<T = any>(timeoutMs?: number): PromiseWithTrigger<T> {
    const state: { accept?: (value: T | PromiseLike<T>) => void, timeout?: NodeJS.Timeout | number } = { accept: undefined };
    return {
        trigger: (value: T | PromiseLike<T>) => {
            if (!state.accept) throw new Error("noop - should not be able to call before Promise is set up");
            state.accept(value);
            if (state.timeout !== undefined) clearTimeout(state.timeout);
        },
        promise: new Promise<T>((accept, reject) => {
            state.accept = accept;

            if (typeof timeoutMs === 'number') {
                state.timeout = setTimeout(() => {
                    reject(new Error("Timed out", { cause: 'timeout' }));
                }, timeoutMs);
            }
        })
    };
}



export function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, milliseconds);
    })
}


type ConsoleLevel = 'debug' | 'log' | 'warn';
export function dLog(area: string, message: string, meta?: any, level?: ConsoleLevel): void {
    const levelSafe: ConsoleLevel = level && ['debug', 'log', 'warn'].includes(level) ? level : 'log';

    const ANSI_BLUE_BRIGHT = '\x1b[94m';
    const ANSI_RESET = '\x1b[0m';

    const preparedMessage = `${ANSI_BLUE_BRIGHT}ℹ️  [${area}]${ANSI_RESET} ${message}`;
    if (meta) {
        console[levelSafe](preparedMessage, meta);
    } else {
        console[levelSafe](preparedMessage);
    }
}
export function dLogDebug(area: string, message: string, meta?: any): void {
    dLog(area, message, meta, 'debug');
}
export function dLogWarn(area: string, message: string, meta?: any): void {
    dLog(area, message, meta, 'warn');
}

/**
 * Given an array, turn it into an record (aka object, aka map)
 * @param arr 
 * @param keyProperty the property whose value will become the record key
 * @example `convertArrayToRecord([{name: 'Bob'}], 'name')` returns {'Bob': {name: 'Bob'}}`
 * @returns 
 */
export function convertArrayToRecord<T extends object = any>(arr: T[], keyProperty: keyof T): Record<string, T> {
    const record: Record<string, T> = {};
    arr.forEach(x => record[x[keyProperty] as string] = x);
    return record;
}


/**
 * Isomorphic way to reliably check if the current environment is a test environment.
 *
 * This function checks for specific environment variables and global objects
 * set by popular testing frameworks.
 *
 * @returns Returns `true` if the environment is a test environment, otherwise `false`.
 */
export function isTest(): boolean {
    // Check for Node.js-based test environments.
    if (typeof process !== 'undefined' && process.env) {
        if (
            // A widely used convention. Jest, by default, sets this. [1]
            process.env.NODE_ENV === 'test' ||
            // A flag set by Vitest. [2]
            process.env.VITEST === 'true' ||
            // A flag set by Bun's test runner.
            process.env.BUN_TEST === 'true' ||
            // Jest sets this environment variable for each worker. [1]
            typeof process.env.JEST_WORKER_ID !== 'undefined'
        ) {
            return true;
        }
    }

    // Check for browser-based test environments.
    // We check for `window` to ensure this code doesn't break in non-browser environments.
    if (typeof window !== 'undefined') {
        // Cypress sets a global `Cypress` object. [3]
        if ("Cypress" in window && typeof window.Cypress !== 'undefined') {
            return true;
        }

        // Karma sets a global `__karma__` object.
        if ("__karma__" in window && typeof window.__karma__ !== 'undefined') {
            return true;
        }

        // Mocha, when run in a browser, often exposes a `mocha` global.
        // We also check for `before` and `after`, which are common in BDD-style frameworks.
        if (
            "mocha" in window &&
            typeof window.mocha !== 'undefined'
        ) {
            return true;
        }
    }

    return false;
}


/**
 * Get the environment's global.
 * Optionally adorn it with extra property types.
 * @returns 
 */
export function getGlobal<T extends Record<string, any> = Record<string, any>>(): typeof globalThis & T {
    return globalThis as typeof globalThis & T;
    /*
    if (typeof window !== 'undefined') {
        return window;
    } else if (typeof self !== 'undefined') {
        return self;
    } else if (typeof globalThis !== 'undefined') {
        return globalThis;
    } else if (typeof global !== 'undefined') {
        return global;
    } else {
        throw new Error("Cannot find global object");
    }
    */
}
