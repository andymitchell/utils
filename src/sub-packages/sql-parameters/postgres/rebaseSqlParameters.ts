/**
 * Shift all Pg `$N` parameter indexes in `sql` so the lowest becomes `rebase`.
 *
 * Why: Allows composing multiple parameterised SQL fragments into one query.
 *
 * @example
 * rebaseSqlParametersPg("age > $1 AND name = $2", 3)
 * // => "age > $3 AND name = $4"
 */
export function rebaseSqlParametersPg(sql: string, rebase: number): string {
    // Subtract 1 so the caller's mental model matches:
    // rebase=2 means "$1" becomes "$2", not "$3".
    const offset = rebase - 1;

    return sql.replace(/\$(\d+)/g, (_match, p1) => {
        const incremented = parseInt(p1, 10) + offset;
        return `$${incremented}`;
    });
}
