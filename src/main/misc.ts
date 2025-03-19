







export function midnight(nowMs?: number):Date {
    if( !nowMs ) nowMs = Date.now();
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
export function promiseWithTrigger<T = any>(timeoutMs?: number):PromiseWithTrigger<T> {
    const state:{accept?:  (value: T | PromiseLike<T>) => void, timeout?: NodeJS.Timeout | number} = {accept: undefined};
    return {
        trigger: (value: T | PromiseLike<T>) => {
            if( !state.accept ) throw new Error("noop - should not be able to call before Promise is set up");
            state.accept(value);
            if( state.timeout!==undefined ) clearTimeout(state.timeout);
        },
        promise: new Promise<T>((accept, reject) => {
            state.accept = accept;

            if( typeof timeoutMs==='number' ) {
                state.timeout = setTimeout(() => {
                    reject(new Error("Timed out"));
                }, timeoutMs);
            }
        })
    };
}



export function sleep(milliseconds: number):Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, milliseconds);
    })
}


type ConsoleLevel = 'debug' | 'log' | 'warn';
export function dLog(area: string, message: string, meta?: any, level?: ConsoleLevel):void {
    const levelSafe:ConsoleLevel = level && ['debug', 'log', 'warn'].includes(level)? level : 'log';

    const ANSI_BLUE_BRIGHT = '\x1b[94m';
    const ANSI_RESET = '\x1b[0m';

    const preparedMessage = `${ANSI_BLUE_BRIGHT}ℹ️  [${area}]${ANSI_RESET} ${message}`;
    if( meta ) {
        console[levelSafe](preparedMessage, meta);
    } else {
        console[levelSafe](preparedMessage);
    }
}
export function dLogDebug(area: string, message: string, meta?: any):void {
    dLog(area, message, meta, 'debug');
}
export function dLogWarn(area: string, message: string, meta?: any):void {
    dLog(area, message, meta, 'warn');
}

/**
 * Given an array, turn it into an record (aka object, aka map)
 * @param arr 
 * @param keyProperty the property whose value will become the record key
 * @example `convertArrayToRecord([{name: 'Bob'}], 'name')` returns {'Bob': {name: 'Bob'}}`
 * @returns 
 */
export function convertArrayToRecord<T extends object = any>(arr:T[], keyProperty: keyof T):Record<string, T> {
    const record:Record<string, T> = {};
    arr.forEach(x => record[x[keyProperty] as string] = x);
    return record;
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
