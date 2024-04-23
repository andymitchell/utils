

export function isValidEmailAddress(emailAddress:string): boolean {
    // most minimal check possible
    return (/.+\@.+\..+/).test(emailAddress);
}

export function irreducibleEmailAddress(emailAddress:string): string | undefined {
    if( !emailAddress ) return undefined;
    emailAddress = emailAddress.toLowerCase().trim();
    if( emailAddress.indexOf('+')>-1 || emailAddress.indexOf('@gmail.com')>-1 ) {
        const split = emailAddress.split('@');
        if( split[0].indexOf('+')>-1 ) {
            split[0] = split[0].split('+')[0];
        }
        if( split[1]==='gmail.com' && split[0].indexOf('.')>-1 ) {
            split[0] = split[0].replace(/\./g, '');
        }
        emailAddress = split[0]+'@'+split[1];
    }
    return emailAddress;
}

export function extractDomainFromEmailAddress(emailAddress:string): string {
    const split = emailAddress.split('@');
    return split[1];
}
export function isGenericDomain(domain:string):boolean {
    return [/gmail\.com/, /googlemail\.com/, /outlook\.com/, /yahoo\.com/, /hotmail\.com/].some(x => x.test(domain));
}