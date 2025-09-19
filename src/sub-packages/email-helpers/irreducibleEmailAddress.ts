
/**
 * Normalizes an email address into an "irreducible" form.
 * 
 * #### Why
 * Helpful for deduping user records and comparing addresses that look
 * different but deliver to the same mailbox (e.g., Gmail aliases).
 *
 * #### How it works
 * - Converts the email to lowercase and trims whitespace.
 * - For Gmail addresses:
 *   - Removes everything after a `+` in the local part (alias handling).
 *   - Removes all `.` characters from the local part.
 * - Leaves other domains unchanged, except for lowercasing and trimming.
 *
 * #### Params 
 * @param emailAddress - The raw email address to normalize. If `undefined` or empty, returns `undefined`.
 * @returns The normalized ("irreducible") email address, or `undefined` if the input was invalid.
 *
 * @example
 * irreducibleEmailAddress("User.Name+label@gmail.com");
 * // → "username@gmail.com"
 *
 * @example
 * irreducibleEmailAddress("Example@Outlook.com");
 * // → "example@outlook.com"
 */
export function irreducibleEmailAddress(emailAddress?:string): string | undefined {
    if( !emailAddress ) return undefined;
    emailAddress = emailAddress.toLowerCase().trim();
    const split = emailAddress.split('@');
    let name = split[0];
    const domain = split[1];
    if( name && name.indexOf('+')>-1 ) {
        name = name.split('+')[0];
    }
    if( !name || !domain ) return undefined;
    
    if( emailAddress.indexOf('+')>-1 || emailAddress.indexOf('@gmail.com')>-1 ) {
        if( domain==='gmail.com' && name.indexOf('.')>-1 ) {
            name = name.replace(/\./g, '');
        }
        emailAddress = name+'@'+domain;
    }
    return emailAddress;
}