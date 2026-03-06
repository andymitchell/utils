/**
 * No-op rebase for SQLite `?` positional parameters — indexes are implicit.
 *
 * Why: Provides a uniform dialect interface so callers don't need to branch.
 */
export function rebaseSqlParametersSqlite(sql: string, _rebase: number): string {
    return sql;
}
