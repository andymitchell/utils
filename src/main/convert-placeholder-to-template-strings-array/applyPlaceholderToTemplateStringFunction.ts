import convertPlaceholderToTemplateStringsArray from "./convertPlaceholderToTemplateStringsArray";

/**
 * Apply a placeholder string and its parameters to a template string function. 
 * 
 *  
 * @param templateStringFunction The magic template string function, e.g. sql
 * @param placeholderString e.g. "SELECT * FROM users WHERE id = $1 AND updated_at > $2"
 * @param params The values, as an array, to replace in the placeholder (i.e. $1 / $2), e.g. [1, '2024-01-01']
 * @example applyPlaceholderToTemplateStringFunction(sql, 'SELECT * FROM $1', [table]) // equivelent to calling drizzle's sql`SELECT * FROM ${table}`
 * 
 */
export default function applyPlaceholderToTemplateStringFunction<T>(templateStringFunction:(templateStrings:TemplateStringsArray, ...params:any[]) => T, placeholderString: string, params:any[] ): T {
    return templateStringFunction(convertPlaceholderToTemplateStringsArray(placeholderString), ...params);
}