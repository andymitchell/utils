import { isEscapedIdentifier } from "./escapeIdentifier.ts";

describe("isEscapedIdentifier", () => {
    test("basic", () => {
        expect(isEscapedIdentifier('token')).toBe(false);
        expect(isEscapedIdentifier('"token"')).toBe(true);
    })

    test("hierarchy", () => {
        expect(isEscapedIdentifier('token.subtoken')).toBe(false);
        expect(isEscapedIdentifier('"token".subtoken')).toBe(false);
        expect(isEscapedIdentifier('token."subtoken"')).toBe(false);
        expect(isEscapedIdentifier('"token"."subtoken"')).toBe(true);
    })

    test("basic quotes", () => {
        expect(isEscapedIdentifier('"to"ken"')).toBe(false);
        expect(isEscapedIdentifier('"to"k"en"')).toBe(false);
        expect(isEscapedIdentifier('"to""ken"')).toBe(true);
    })

    test("hierarchy quotes", () => {
        expect(isEscapedIdentifier('"to"ken"."sub"token"')).toBe(false);
        expect(isEscapedIdentifier('"to"k"en"."sub"t"oken"')).toBe(false);
        expect(isEscapedIdentifier('"token"."sub"token"')).toBe(false);
        expect(isEscapedIdentifier('"to""ken"."sub""token"')).toBe(true);
    })

    test("basic periods", () => {
        expect(isEscapedIdentifier('"to.ken".')).toBe(false);
        expect(isEscapedIdentifier('."to.ken"')).toBe(false);
        expect(isEscapedIdentifier('"to"".""ken"')).toBe(true);
        expect(isEscapedIdentifier('"to.ken"')).toBe(true);
    })

    test("hierarchy periods", () => {
        expect(isEscapedIdentifier('"to"".""ken"')).toBe(true);
        expect(isEscapedIdentifier('"to.ken"."sub.token"')).toBe(true);
    })

    test("empty", () => {
        expect(isEscapedIdentifier('""')).toBe(false);
        expect(isEscapedIdentifier('"token".""')).toBe(false);
        expect(isEscapedIdentifier('""."subtoken"')).toBe(false);
    })

    test("white space", () => {
        function testLineReturnCharacters(str:string, expected:boolean) {
            const whitespace = ["\n", "\r"];
            for( const char of whitespace ) {
                const token = str.replace(/<WHITESPACE>/g, char);
                const passes = isEscapedIdentifier(token);
                if( passes ) debugger;
                expect(passes).toBe(expected);
            }
        }

        function testSpaceCharacters(str:string, expected:boolean) {
            const whitespace = [" ", "\t"];
            for( const char of whitespace ) {
                const token = str.replace(/<WHITESPACE>/g, char);
                const passes = isEscapedIdentifier(token);
                if( passes ) debugger;
                expect(passes).toBe(expected);
            }
        }

        testLineReturnCharacters("\"token\"<WHITESPACE>", false);
        testLineReturnCharacters("<WHITESPACE>\"token\"", false);
        testLineReturnCharacters("\"<WHITESPACE>token\"", false);
        testLineReturnCharacters("\"tok<WHITESPACE>en\"", false);

        
        testSpaceCharacters("\"token\"<WHITESPACE>",false);
        testSpaceCharacters("<WHITESPACE>\"token\"", false);
        testSpaceCharacters("\"to<WHITESPACE>ken\"", true);

    })
})