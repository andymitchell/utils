export type SqlDialect = 'pg' | 'sqlite';

export type SqlFragment = { sql: string; parameters: any[] };

export type AppendSqlParametersResult = {
    sql: string;
    parameters: any[];
    complete_parameters: any[];
};
