
function splitOnUnquotedPeriods(str:string):string[] {
    const regex = /"[^"]*(?:""[^"]*)*"|[^".]+/g;
    const tokens = [];

    let match:RegExpExecArray | null;
    while ((match = regex.exec(str))) {
        tokens.push(match[0]);
        if( match===null ) break;
    }

    return tokens;
}

const LINE_RETURNS_REGEX = /[\r\n]/;
export function isEscapedIdentifier(str:string):boolean {
    // Line returns are forbidden
    if( LINE_RETURNS_REGEX.test(str) ) return false;

    // Check at the top level that it's wrapped in quotes (even if '"token"."subtoken"'), otherwise splitOnUnquotedPeriods misses things like '"token".'
    if( str[0]!=='"' || str[str.length-1]!=='"'  ) {
        return false;
    }
    
    const tokens = splitOnUnquotedPeriods(str);
    return tokens.every(x => {
        return /^"(?:[^"]|"")+"$/.test(x)
    });
}

/**
 * Make an identifier (e.g. schema, table name) safe for use in Postgres. 
 * 
 * It automatically checks if it's already escaped, and doesn't change it if so. 
 * 
 * @param identifierToEscapeOrAlreadyEscaped
 * @returns 
 */
export function escapeIdentifier(identifierToEscapeOrAlreadyEscaped:string):string {
    if( isEscapedIdentifier(identifierToEscapeOrAlreadyEscaped) ) return identifierToEscapeOrAlreadyEscaped;
    identifierToEscapeOrAlreadyEscaped = identifierToEscapeOrAlreadyEscaped.replace(/"/g, '""');
    if( LINE_RETURNS_REGEX.test(identifierToEscapeOrAlreadyEscaped) ) throw new Error("Invalid character");

    return `"${identifierToEscapeOrAlreadyEscaped}"`;
}
