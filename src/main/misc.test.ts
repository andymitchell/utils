import { getGlobal, stripCircularReferences, promiseWithTrigger } from "./misc"

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

describe('stripCircularReferences', () => {

    test('basic', () => {
        const obj = {hello: "world", child: {goodbye: "to you"}};
        expect(stripCircularReferences(obj)).toEqual(obj);

    })


    test('the same item seen twice is fine', () => {
        const subObj = {hello: "world"};

        const obj: any = {
            a: subObj,
            b: {
                c: subObj
            },
        };
        
        const result = stripCircularReferences(obj);
        
        expect(stripCircularReferences(obj)).toEqual(obj);
        
    })

    test('circular', () => {
        const obj: any = {
            a: 1,
            b: {
                c: 2,
                d: null,
            },
        };
        obj.b.e = obj;
        
        const result = stripCircularReferences(obj);
        
        expect(result).toEqual({
            ...obj,
            b: {
                ...obj.b,
                e: "[Circular *]"
            }
        });
        
    })

    test('can stringify a circular object, with a function', () => {
        const obj: any = {
            a: 1,
            b: {
                c: 2,
                d: () => true,
            },
        };
        obj.b.e = obj;

        let error = false;
        try {
            JSON.stringify(obj);
        } catch(e) {
            error = true;
        }
        expect(error).toBe(true);
        
        const result = JSON.stringify(stripCircularReferences(obj));
        
        expect(result).toBe("{\"a\":1,\"b\":{\"c\":2,\"e\":\"[Circular *]\"}}")
        
    })

})