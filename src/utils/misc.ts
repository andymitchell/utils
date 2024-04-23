








export function midnight(nowMs?: number):Date {
    if( !nowMs ) nowMs = Date.now();
    const d = new Date(nowMs);
    d.setHours(0);
    d.setMinutes(0);
    d.setMilliseconds(0);
    return d;
}




type PromiseWithTrigger<T = any> = {
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


