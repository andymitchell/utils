import { createCompositeTimestamp, gtCompositeTimestamp, gteCompositeTimestamp, sortCompositeTimestamp } from "./compositeTimestamp"

describe('sortCompositeTimestamp test', () => {

    test('sort numbers', () => {
        expect(sortCompositeTimestamp(0, 0)).toBe(0);

        expect(sortCompositeTimestamp(1, 0)).toBe(1);

        expect(sortCompositeTimestamp(0, 1)).toBe(-1);
    })

    test('sort composites', () => {
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,0))).toBe(0);

        expect(sortCompositeTimestamp(createCompositeTimestamp(1,0), createCompositeTimestamp(0,0))).toBe(1);

        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(1,0))).toBe(-1);
    })

    test('sort composites indexes', () => {
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,0))).toBe(0);

        expect(sortCompositeTimestamp(createCompositeTimestamp(0,1), createCompositeTimestamp(0,1))).toBe(0);

        expect(sortCompositeTimestamp(createCompositeTimestamp(1,1), createCompositeTimestamp(1,1))).toBe(0);
        
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,1), createCompositeTimestamp(0,0))).toBe(1);

        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,1))).toBe(-1);
    })


    test('sort mixed', () => {
        expect(sortCompositeTimestamp(0, createCompositeTimestamp(0,0))).toBe(0);
        
        expect(sortCompositeTimestamp(1, createCompositeTimestamp(0,0))).toBe(1);

        expect(sortCompositeTimestamp(0, createCompositeTimestamp(1,0))).toBe(-1);
    })

    
    test('sort mixed reversed', () => {
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), 0)).toBe(0);
        
        expect(sortCompositeTimestamp(createCompositeTimestamp(1,0), 0)).toBe(1);

        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), 1)).toBe(-1);
    })

    test('sort mixed indexes', () => {
        expect(sortCompositeTimestamp(0, createCompositeTimestamp(0,0))).toBe(0);
        
        expect(sortCompositeTimestamp(1, createCompositeTimestamp(0,1))).toBe(1);

        expect(sortCompositeTimestamp(0, createCompositeTimestamp(0,1))).toBe(-1);
    })

    test('sort mixed indexes reversed', () => {
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,0), 0)).toBe(0);
        
        expect(sortCompositeTimestamp(createCompositeTimestamp(0,1), 0)).toBe(1);

        expect(sortCompositeTimestamp(createCompositeTimestamp(0,1), 1)).toBe(-1);
    })
})

describe('gtCompositeTimestamp test', () => {

    // gtCompositeTimestamp uses sortCompositeTimestamp, so that test block checks the nuance. This just makes sure gtCompositeTimestamp works at all. 

    test('gtCompositeTimestamp basic', () => {
        expect(gtCompositeTimestamp(1, 0)).toBe(true);

        expect(gtCompositeTimestamp(0, 1)).toBe(false);

        expect(gtCompositeTimestamp(0, 0)).toBe(false);

        expect(gtCompositeTimestamp(createCompositeTimestamp(0,1), createCompositeTimestamp(0,0))).toBe(true);
        expect(gtCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,0))).toBe(false);
    })

})


describe('getCompositeTimestamp test', () => {

    // gteCompositeTimestamp uses sortCompositeTimestamp, so that test block checks the nuance. This just makes sure gtCompositeTimestamp works at all. 

    test('gtCompositeTimestamp basic', () => {
        expect(gteCompositeTimestamp(1, 0)).toBe(true);

        expect(gteCompositeTimestamp(0, 1)).toBe(false);

        expect(gteCompositeTimestamp(0, 0)).toBe(true);

        expect(gteCompositeTimestamp(createCompositeTimestamp(0,1), createCompositeTimestamp(0,0))).toBe(true);
        expect(gteCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,0))).toBe(true);
        expect(gteCompositeTimestamp(createCompositeTimestamp(0,0), createCompositeTimestamp(0,1))).toBe(false);
    })

})