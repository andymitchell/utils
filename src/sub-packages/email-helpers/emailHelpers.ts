

export function isValidEmailAddress(emailAddress:string): boolean {
    // most minimal check possible
    return (/.+\@.+\..+/).test(emailAddress);
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