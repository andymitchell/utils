

export function isValidEmailAddress(emailAddress:string): boolean {
    // most minimal check possible
    return (/.+\@.+\..+/).test(emailAddress);
}

export function irreducibleEmailAddress(emailAddress:string): string | undefined {
    if( !emailAddress ) return undefined;
    emailAddress = emailAddress.toLowerCase().trim();
    if( emailAddress.indexOf('+')>-1 || emailAddress.indexOf('@gmail.com')>-1 ) {
        const split = emailAddress.split('@');
        let name = split[0];
        const domain = split[1];
        if( name && name.indexOf('+')>-1 ) {
            name = name.split('+')[0];
        }
        if( !name || !domain ) return undefined;
        if( domain==='gmail.com' && name.indexOf('.')>-1 ) {
            name = name.replace(/\./g, '');
        }
        emailAddress = name+'@'+domain;
    }
    return emailAddress;
}

export function extractDomainFromEmailAddress(emailAddress:string): string {
    const split = emailAddress.split('@');
    const domain = split[1];
    if( !domain ) throw new Error("No domain found");
    return domain;
}
export function isGenericDomain(domain:string):boolean {
    return [/gmail\.com/, /googlemail\.com/, /outlook\.com/, /yahoo\.com/, /hotmail\.com/].some(x => x.test(domain));
}