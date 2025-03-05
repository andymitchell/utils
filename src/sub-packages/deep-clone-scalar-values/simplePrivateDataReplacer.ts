/**
 * Replaces sensitive private data (emails, sequences of digits, and tokens) with a partially obfuscated version.
 *
 * This function detects and obfuscates the following types of data within a given string:
 * - **Email addresses**: Retains the first character of the local part and the last few characters of the domain.
 * - **Sequences of digits** (e.g., phone numbers, credit cards): Retains the first and last two digits while replacing the middle with ellipses.
 * - **Long unbroken tokens** (e.g., API keys, session tokens): Retains the first and last three characters while masking the middle.
 *
 * @param {any} value - The input value to process. It will be converted to a string if not already.
 * @returns {string} - A sanitized version of the input with sensitive data partially obscured.
 */
export function simplePrivateDataReplacer(value: any): string {
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
        // Remove non-digit characters
        const cleanDigits = digits.replace(/\D/g, '');
        return cleanDigits.replace(/(\d{2})\d+(\d{2})/, '$1...$2');
    };

    // Helper function to partially hide tokens
    const hideToken = (token: string): string => {
        return `${token.slice(0, 3)}...${token.slice(-3)}`;
    };

    // Email regex pattern
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
    // Pattern to match sequences of digits (including those with spaces, dashes, or dots)
    const digitPattern = /\b(\d[ -.]?){7,}\b/g;
    // Pattern to match possible tokens (unbroken strings longer than 20 characters)
    const tokenPattern = /\b[^\s]{20,}\b/g;

    let strValue = value.toString();
    

    // Replace emails
    strValue = strValue.replace(emailPattern, (match: string) => hideEmail(match));

    // Replace sequences of digits
    strValue = strValue.replace(digitPattern, (match: string) => hideDigits(match));

    // Replace possible tokens
    strValue = strValue.replace(tokenPattern, (match: string) => hideToken(match));

    return strValue;
}
