/**
 * Remove characters to make 2 strings more comparable. 
 * 
 * Strip all non visual characters (inc new lines) - because AI can return invisible characters or weird encodings for things like spaces.
 * AI also likes to convert " to ', and this standardises that.
 * 
 * @param string 
 */
export function reduceCharactersToEssentialsForComparison(text:string):string {

    const printableRegex = /[^\x20-\x7E]/g;
    text = text.replace(printableRegex, ' ');

    return text.replace(/[ \s]{2,}/g, ' ').replace(/\"/g, "'").toLowerCase();

}