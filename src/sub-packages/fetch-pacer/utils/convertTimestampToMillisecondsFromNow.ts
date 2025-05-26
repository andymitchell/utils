
export function convertTimestampToMillisecondsFromNow(ts:number | undefined):number | undefined {
    if( typeof ts==='number' ) {
        let ms = ts-Date.now();
        if( ms>0 ) {
            return ms;
        }
    }
}