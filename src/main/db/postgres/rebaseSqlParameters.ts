import {
    rebaseSqlParameters as _rebaseSqlParameters,
    appendSqlParameters as _appendSqlParameters,
    concatSqlParameters as _concatSqlParameters,
} from '../../../sub-packages/sql-parameters/sql-parameters.ts';
import type { SqlFragment, AppendSqlParametersResult } from '../../../sub-packages/sql-parameters/types.ts';

/**
 * @deprecated Use `rebaseSqlParameters` from `@andyrmitchell/utils/sql-parameters` with `dialect: 'pg'`.
 *
 * @example
 * rebaseSqlParameters("age > $1 AND name = $2", 2) // => "age > $2 AND name = $3"
 */
export function rebaseSqlParameters(sql: string, rebase: number): string {
    return _rebaseSqlParameters(sql, rebase, 'pg');
}

/**
 * @deprecated Use `appendSqlParameters` from `@andyrmitchell/utils/sql-parameters` with `dialect: 'pg'`.
 *
 * @example
 * appendSqlParameters(['a', 'b'], { sql: 'age > $1', parameters: [5] })
 */
export function appendSqlParameters(existingParameters: any[], appending: SqlFragment): AppendSqlParametersResult {
    return _appendSqlParameters(existingParameters, appending, 'pg');
}

/**
 * @deprecated Use `concatSqlParameters` from `@andyrmitchell/utils/sql-parameters` with `dialect: 'pg'`.
 *
 * @example
 * concatSqlParameters([{ sql: 'age > $1', parameters: [5] }, { sql: 'name = $1', parameters: ['Bob'] }])
 */
export function concatSqlParameters(fragments: SqlFragment[], join = ' AND '): SqlFragment {
    return _concatSqlParameters(fragments, 'pg', join);
}