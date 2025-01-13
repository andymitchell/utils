import {v4 as uuidV4} from 'uuid';

export {uuidV4};

export function uid(maxLength?:number, fastAndSimple?: boolean):string {
    if( fastAndSimple ) {
        return uidFastAndSimple(maxLength);
    } else {
        if( maxLength===undefined ) {
            return uuidV4();
        } else {
            return uuidV4().substring(0, maxLength);
        }
    }
}

let uidSessionId = Math.round(Math.random()*1000)+'';
let uidIdx = 0;
const hex = ['a','b','c','d','e','f'];
export function uidFastAndSimple(maxLength?:number):string {
    const str = (uidIdx++)+'-'+Math.round(Math.random()*1000)+'-'+performance.now().toString().slice(-6)+'-'+uidSessionId;
    return maxLength? str.substring(0, maxLength) : str;
}