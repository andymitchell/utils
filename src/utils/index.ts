import md5 from 'md5';
import {v4 as uuidv4} from 'uuid';




export function uid(maxLength?:number, fastAndSimple?: boolean):string {
    if( fastAndSimple ) {
        return uidFastAndSimple(maxLength);
    } else {
        if( maxLength===undefined ) {
            return uuidv4();
        } else {
            return uuidv4().substring(0, maxLength);
        }
    }
}
let uidSessionId = Math.round(Math.random()*1000)+'';
let uidIdx = 0;
const hex = ['a','b','c','d','e','f'];
export function uidFastAndSimple(maxLength?:number):string {
    if( maxLength===undefined ) {
        return uidSessionId+'-'+Date.now()+'-'+Math.round(Math.random()*1000)+'-'+(uidIdx++);
    } else {
        return (md5(uidSessionId+'-'+Date.now()+'-'+Math.round(Math.random()*1000)+'-'+(uidIdx++)) as string).substr(0, maxLength-1)+(hex[Math.round(Math.random()*(hex.length-1))]); // The last part prevents entirely numberic ids, which can cause problems as array keys 
    }
}



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


