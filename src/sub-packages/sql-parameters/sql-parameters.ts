import type { AppendSqlParametersResult, SqlDialect, SqlFragment } from './types.ts';
import { rebaseSqlParametersPg } from './postgres/rebaseSqlParameters.ts';
import { rebaseSqlParametersSqlite } from './sqlite/rebaseSqlParameters.ts';

/**
 * Shift every `$N` parameter index in `sql` so the lowest becomes `startAt`.
 *
 * For most callers — composing parameterised fragments into a WHERE — prefer
 * {@link appendSqlParameters}, which reindexes AND concatenates argument
 * arrays in one call. Use `reindexSqlParameters` directly only when the
 * parameter array has already been merged.
 *
 * Note: `startAt === 1` is a no-op for `'pg'` because Postgres parameters
 * already start at `$1`. If you want to reserve `$1` for a payload and push
 * an existing fragment above it, pass `2`. For `'sqlite'` all values are
 * no-ops — `?` placeholders are positional.
 *
 * Why: Enables composing multiple parameterised fragments regardless of dialect.
 *
 * @example
 * reindexSqlParameters("age > $1 AND name = $2", 3, 'pg')
 * // => "age > $3 AND name = $4"
 *
 * @example
 * reindexSqlParameters("age > ? AND name = ?", 3, 'sqlite')
 * // => "age > ? AND name = ?"  (no-op — positional)
 */
export function reindexSqlParameters(sql: string, startAt: number, dialect: SqlDialect): string {
    switch (dialect) {
        case 'pg':
            return rebaseSqlParametersPg(sql, startAt);
        case 'sqlite':
            return rebaseSqlParametersSqlite(sql, startAt);
    }
}

/**
 * @deprecated Renamed to {@link reindexSqlParameters} for clarity — `rebase`
 * was ambiguous (it means "start at this index", not "shift by this many"
 * — so `rebase=1` is a silent no-op on pg). Same behaviour; switch the
 * import when convenient.
 *
 * Shift every `$N` parameter index in `sql` so the lowest becomes `startAt`.
 *
 * For most callers — composing parameterised fragments into a WHERE — prefer
 * {@link appendSqlParameters}, which reindexes AND concatenates argument
 * arrays in one call. Use this directly only when the parameter array has
 * already been merged.
 *
 * Note: `startAt === 1` is a no-op for `'pg'`. Pass `2` to push existing
 * fragments above a reserved `$1`. For `'sqlite'` all values are no-ops.
 *
 * @example
 * rebaseSqlParameters("age > $1 AND name = $2", 3, 'pg')
 * // => "age > $3 AND name = $4"
 *
 * @example
 * rebaseSqlParameters("age > ? AND name = ?", 3, 'sqlite')
 * // => "age > ? AND name = ?"  (no-op — positional)
 */
export const rebaseSqlParameters = reindexSqlParameters;

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
    const sql = reindexSqlParameters(appending.sql, existingParameters.length + 1, dialect);
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
