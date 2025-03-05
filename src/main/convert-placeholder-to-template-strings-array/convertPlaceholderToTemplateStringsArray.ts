/**
 * Given a placeholder string, return the TemplateStringArray format
 * 
 * It's intended to make a placeholder string be passable to a template string function. 
 * 
 * E.g. suppose you generate a traditional SQL placeholder combo: const traditional = {query: "SELECT * FROM countries WHERE name = $1", params: ['UK']}
 *  But your library uses template strings, e.g. sql\`SELECT * FROM countries WHERE name = ${'UK'}\` 
 *  The same function can always be used (as all template string functions can) with: sql(convertPlaceholderToTemplateStringsArray(traditional.query), traditional.params)
 * 
 * @param placeholderString e.g. "SELECT * FROM users WHERE id = $1 AND updated_at > $2"
 * 
 */
export default function convertPlaceholderToTemplateStringsArray(placeholderString: string): TemplateStringsArray {
    // Split on the placeholders (e.g., $1, $2)
    const parts = placeholderString.split(/\$\d+/);

    // Freeze the array and cast it as TemplateStringsArray
    const templateStringsArray = Object.freeze(parts) as unknown as TemplateStringsArray;

    return templateStringsArray;
}