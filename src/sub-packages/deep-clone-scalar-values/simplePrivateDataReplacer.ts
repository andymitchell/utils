/**
 * Replaces sensitive private data (emails, sequences of digits, and tokens) with a partially obfuscated version,
 * while intelligently handling URLs by sanitizing their query parameters.
 *
 * This function detects and obfuscates the following types of data within a given string:
 * - **URLs**: Keeps the URL structure intact but recursively sanitizes its query parameters.
 * - **Email addresses**: Retains the first character of the local part and the last few characters of the domain.
 * - **Sequences of digits** (e.g., phone numbers, credit cards): Retains the first and last two digits while replacing the middle with ellipses.
 * - **Long unbroken tokens** (e.g., API keys, session tokens): Retains the first and last three characters while masking the middle.
 *
 * @param {any} value - The input value to process. It will be converted to a string.
 * @returns {string} - A sanitized version of the input with sensitive data partially obscured.
 */
export function simplePrivateDataReplacer(value: any): string {
    return internalSimplePrivateDataReplacer(value);
}


const URL_PLACEHOLDER = "__URL_PH@";
if( URL_PLACEHOLDER.length>10 ) throw new Error("URL_PLACEHOLDER must be short, otherwise it will get picked up as a token.");

function internalSimplePrivateDataReplacer(value: any, depth = 0): string {
    

    // Prevent infinite recursion attacks.
    if (depth > 20) {
        return '[Sanitized: Max Depth Reached]';
    }

    let strValue: string;

    // Safely convert the input value to a string, guarding against malicious .toString() methods.
    try {
        const valueType = typeof value;
        if (valueType === 'string') {
            strValue = value;
        } else if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
            strValue = String(value);
        } else if (value === null) {
            return '[sanitized:null]';
        } else if (value === undefined) {
            return '[sanitized:undefined]';
        } else {
            // For objects/arrays, use JSON.stringify as a safe serialization method.
            // It handles circular references by throwing an error, which we catch.
            strValue = JSON.stringify(value, undefined, 1);
        }
    } catch(e) {
        return '[Sanitized: Unserializable Input]';
    }


    // Helper function to partially hide email addresses
    const hideEmail = (email: string): string => {
        const emailParts = email.split('@');
        const localPart = emailParts[0];
        const domainPart = emailParts[1];

        if (localPart && domainPart && localPart.length > 1) {
            return `${localPart[0]}...@...${domainPart.slice(-7)}`;
        }
        return email;
    };

    // Helper function to partially hide sequences of digits (phone numbers, credit cards)
    const hideDigits = (digits: string): string => {
        // Remove non-digit characters to handle formats like '123-456-7890'
        const cleanDigits = digits.replace(/\D/g, '');
        // Must have at least 5 digits to be obfuscated
        if (cleanDigits.length < 5) {
            return digits; // Return original if too short to hide
        }
        return cleanDigits.replace(/(\d{2})\d+(\d{2})/, '$1...$2');
    };

    // Helper function to partially hide tokens
    const hideToken = (token: string): string => {
        // Must be long enough to hide something meaningful
        if (token.length < 7) {
            return token;
        }
        return `${token.slice(0, 3)}...${token.slice(-3)}`;
    };

    // --- REGEX PATTERNS ---

    // Pattern to match common URLs.
    const urlPattern = /https?:\/\/[^\s]+/g;
    // Email regex pattern
    const emailPattern = /(?=\b.{1,254}\b)\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,20}\b/g;
    // Pattern to match sequences of digits (including those with spaces, dashes, or dots)
    // Looking for 7 or more digits, possibly separated by common delimiters.
    const digitPattern = /\b\d(?:[ -.]*\d){6,}\b/g;
    // Pattern to match possible tokens (unbroken strings longer than 20 characters)
    const tokenPattern = /[^\s]{20,}/g; 


    // --- SANITIZATION ORDER ---
    // The order is important: We handle specific, structured data (URLs) first,
    // before applying more general patterns that might incorrectly match parts of it.

    const placeholders = new Map<string, string>();
    let placeholderId = 0;

    // Handle URLs: Sanitize their query parameters recursively.
    // Ignore recursive calls with urls... that could be a hack to bury a token in recursed url param by putting http:// in front of it (this is covered by a test).
    if( depth===0 ) {
        strValue = strValue.replace(urlPattern, (urlMatch) => {
            try {
                const urlObject = new URL(urlMatch);
                urlObject.searchParams.forEach((paramValue, paramKey) => {
                    // RECURSIVE CALL: Sanitize the parameter's value
                    const sanitizedValue = internalSimplePrivateDataReplacer(paramValue, depth + 1);
                    // Update the URL with the sanitized parameter
                    urlObject.searchParams.set(paramKey, sanitizedValue);
                });

                const sanitizedUrl = urlObject.toString();
                const placeholder = `${URL_PLACEHOLDER}${placeholderId++}__`;
                placeholders.set(placeholder, sanitizedUrl);
                return placeholder;
            } catch (e) {
                // If parsing fails, it's not a valid URL. Return the original match to avoid breaking it.
                return urlMatch;
            }
        });
    }

    // Replace emails (that are not inside URL params we just sanitized)
    strValue = strValue.replace(emailPattern, hideEmail);


    // Replace sequences of digits
    strValue = strValue.replace(digitPattern, hideDigits);


    // Replace possible tokens (this will now ignore URLs)
    strValue = strValue.replace(tokenPattern, hideToken);

    placeholders.forEach((restoredValue, placeholder) => {
        // Use a simple replace; placeholders are unique so this is safe.
        strValue = strValue.replace(placeholder, restoredValue);
    });

    return strValue;
}

