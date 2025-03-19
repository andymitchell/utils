import { convertArrayToRecord, getGlobal, promiseWithTrigger } from "./misc.ts"

test('getGlobal', () => {
    const glob = getGlobal();
    expect(!!glob).toBe(true);
})

describe('promiseWithTrigger', () => {
    test('timout', async () => {
        
        const pwt = promiseWithTrigger(50);

        let error: Error | undefined;
        try {
            await pwt.promise;
        } catch(e) {
            if( e instanceof Error ) error = e;
        }

        expect(error?.message).toBe('Timed out');

    }, 1000)
})

describe('convertArrayToRecord', () => {
    test('basic', () => {
        const result = convertArrayToRecord([{name: 'Bob'}], 'name');
        expect(result).toEqual({'Bob': {name: 'Bob'}})
    })
})