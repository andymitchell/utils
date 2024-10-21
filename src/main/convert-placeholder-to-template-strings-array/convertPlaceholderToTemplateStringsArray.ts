/**
 * Given a placeholder string, return the TemplateStringArray format
 * @param placeholderString e.g. "SELECT * FROM users WHERE id = $1 AND updated_at > $2"
 */
export default function convertPlaceholderToTemplateStringsArray(placeholderString: string): TemplateStringsArray {
    // Split on the placeholders (e.g., $1, $2)
    const parts = placeholderString.split(/\$\d+/);

    // Freeze the array and cast it as TemplateStringsArray
    const templateStringsArray = Object.freeze(parts) as unknown as TemplateStringsArray;

    return templateStringsArray;
}