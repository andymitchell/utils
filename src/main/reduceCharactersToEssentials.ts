/**
 * Remove characters to make 2 strings more comparable
 * @param string 
 */
export default function reduceCharactersToEssentials(text:string):string {
    // Strip all non visual characters (inc new lines) - because AI can return invisible characters or weird encodings for things like spaces 
    // It also likes to convert " to '

    const printableRegex = /[^\x20-\x7E]/g;
    text = text.replace(printableRegex, ' ');

    return text.replace(/[ \s]{2,}/g, ' ').replace(/\"/g, "'").toLowerCase();

}