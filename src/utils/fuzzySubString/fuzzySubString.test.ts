
import fuzzySubString from ".";


describe('fuzzySubString', () => {

    test('basic fuzzySubString', () => {

        const haystack1 = "It's amazing how quick he was and still kept his cadence and timing despite being interrupted";

        const result1 = fuzzySubString(haystack1, ["amazing ", "how ", "quick he was"]);
        const result2 = fuzzySubString("It's amazing how quick he was and still kept his cadence and timing despite being interrupted", ["amazing", "how", "quick he was"]);
        const result3 = fuzzySubString("It's amazing how quick he was and still kept his cadence and timing despite being interrupted, and it's amazing how so very quick he was at maths", ["amazing", "how", "quick he was"]);

        expect(!!result1).toBe(true); if( !result1 ) throw new Error("noop - typeguard");
        expect(!!result2).toBe(true); if( !result2 ) throw new Error("noop - typeguard");
        expect(!!result3).toBe(true); if( !result3 ) throw new Error("noop - typeguard");
        
        
        const expected1 = {"matchedText":"amazing how quick he was","startPosition":5,"endPosition":29,"hasGaps":false};
        const expected2And3 = {"matchedText":"amazing how quick he was","startPosition":5,"endPosition":29,"hasGaps":true};

        expect(result1).toEqual(expected1);
        expect(result2).toEqual(expected2And3);
        expect(result3).toEqual(expected2And3);

        const resultText2 = haystack1.substring(result2.startPosition, result2.endPosition);
        expect(resultText2).toBe(expected2And3.matchedText);

    });
});
