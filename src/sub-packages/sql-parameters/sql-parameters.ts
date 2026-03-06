import type { AppendSqlParametersResult, SqlDialect, SqlFragment } from './types.ts';
import { rebaseSqlParametersPg } from './postgres/rebaseSqlParameters.ts';
import { rebaseSqlParametersSqlite } from './sqlite/rebaseSqlParameters.ts';

/**
 * Shift parameter indexes in `sql` so the lowest becomes `rebase`.
 *
 * Why: Enables composing multiple parameterised fragments regardless of dialect.
 *
 * @example
 * rebaseSqlParameters("age > $1 AND name = $2", 3, 'pg')
 * // => "age > $3 AND name = $4"
 *
 * @example
 * rebaseSqlParameters("age > ? AND name = ?", 3, 'sqlite')
 * // => "age > ? AND name = ?"  (no-op — positional)
 */
export function rebaseSqlParameters(sql: string, rebase: number, dialect: SqlDialect): string {
    switch (dialect) {
        case 'pg':
            return rebaseSqlParametersPg(sql, rebase);
        case 'sqlite':
            return rebaseSqlParametersSqlite(sql, rebase);
    }
}

/**
 * Rebase `appending`'s SQL to sit above `existingParameters`, then merge.
 *
 * Why: Lets you incrementally build a query by appending parameterised fragments.
 *
 * @example
 * appendSqlParameters(['a', 'b'], { sql: 'age > $1', parameters: [5] }, 'pg')
 * // => { sql: 'age > $3', parameters: [5], complete_parameters: ['a', 'b', 5] }
 */
export function appendSqlParameters(
    existingParameters: any[],
    appending: SqlFragment,
    dialect: SqlDialect,
): AppendSqlParametersResult {
    const sql = rebaseSqlParameters(appending.sql, existingParameters.length + 1, dialect);
    return {
        sql,
        parameters: appending.parameters,
        complete_parameters: [...existingParameters, ...appending.parameters],
    };
}

/**
 * Combine multiple parameterised SQL fragments into one, joining with `join`.
 *
 * Why: The primary entry point for building composite WHERE clauses across dialects.
 *
 * @example
 * concatSqlParameters(
 *   [{ sql: 'age > $1', parameters: [5] }, { sql: 'name = $1', parameters: ['Bob'] }],
 *   'pg',
 *   ' AND '
 * )
 * // => { sql: 'age > $1 AND name = $2', parameters: [5, 'Bob'] }
 */
export function concatSqlParameters(
    fragments: SqlFragment[],
    dialect: SqlDialect,
    join = ' AND ',
): SqlFragment {
    const sqlParts: string[] = [];
    let parameters: any[] = [];

    for (const fragment of fragments) {
        const result = appendSqlParameters(parameters, fragment, dialect);
        sqlParts.push(result.sql);
        parameters = result.complete_parameters;
    }

    return { sql: sqlParts.join(join), parameters };
}
