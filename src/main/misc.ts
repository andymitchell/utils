








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
export function promiseWithTrigger<T = any>():PromiseWithTrigger<T> {
    const state:{accept?:  (value: T | PromiseLike<T>) => void} = {accept: undefined};
    return {
        trigger: (value: T | PromiseLike<T>) => {
            if( !state.accept ) throw new Error("noop - should not be able to call before Promise is set up");
            state.accept(value);
        },
        promise: new Promise<T>(accept => {
            state.accept = accept;
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