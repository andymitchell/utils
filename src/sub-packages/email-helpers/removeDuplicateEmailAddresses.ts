import { irreducibleEmailAddress } from "./irreducibleEmailAddress.ts";

type PluckEmailAddress<T extends Record<string, any>> = (x:T) => string;

/**
 * Removes duplicate contacts based on email.
 *
 * In short: give it a list of contacts → it returns a new list where each email
 * only shows up once. The first contact with that email is kept, the rest are dropped.
 *
 * How it works:
 * - By default, it compares on the **normalized** email. That means different
 *   Gmail variants that all land in the same inbox (like
 *   `bob.smith+work@gmail.com` and `bobsmith@gmail.com`) are treated as the same.
 * - You can switch this off to compare on the raw email string.
 * - Each kept contact gets a new field: `irreducibleEmailAddress`
 *   (the normalized form, if found).
 * - Contacts without an email are skipped.
 *
 * @typeParam T - Shape of each contact object.
 * @param contacts - List of contacts (or `[]` if falsy).
 * @param pluckEmailAddress - Function to get the email. Defaults to `(x) => x.emailAddress`.
 * @param compareOnIrreducible - Compare on normalized email? (default: `true`).
 * @returns New array of contacts with duplicates removed.
 * 
 * @example
 * type Contact = { id: string; emailAddress?: string; };
 * const contacts: Contact[] = [
 *   { id: "1", emailAddress: "Bob.Smith+work@gmail.com" },
 *   { id: "2", emailAddress: "bobsmith@gmail.com" },
 *   { id: "3", emailAddress: "alice@example.com" },
 * ];
 *
 * removeDuplicateEmailAddresses(contacts);
 * // => [ { id: "1", ..., irreducibleEmailAddress: "bobsmith@gmail.com" },
 * //      { id: "3", ..., irreducibleEmailAddress: "alice@example.com" } ]
 */
export function removeDuplicateEmailAddresses<T extends Record<string, any>>(contacts:T[], pluckEmailAddress:PluckEmailAddress<T>  = (x:T) => x.emailAddress, compareOnIrreducible = true):(T & {irreducibleEmailAddress?:string})[] {
    if (!contacts) {
        return [];
    }
    const seen = new Set<string>();
    
    return contacts.reduce((acc: (T & { irreducibleEmailAddress?: string })[], contact) => {
        const email = pluckEmailAddress(contact);
        const irreducible = irreducibleEmailAddress(email);
        const comparable = compareOnIrreducible? irreducible : email;

        if (comparable && !seen.has(comparable)) {
            seen.add(comparable);
            acc.push({
                ...contact,
                irreducibleEmailAddress: irreducible,
            });
        }
        return acc;
    }, []);
}