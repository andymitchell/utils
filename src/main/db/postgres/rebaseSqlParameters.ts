/**
 * Relatively shift all parameter indexes in 'sql' to start from the 'rebase' number
 * 
 * Example:
 * If sql = "age > $1 and name = $2", and rebase = 2, it'll return "age > $2 and name = $3"
 * 
 * @param sql 
 * @param rebase The new lowest parameter index to use
 * @returns 
 */
export function rebaseSqlParameters(sql: string, rebase: number): string {
    
    // Why subtract 1? 
    // The rebase is the stated goal. So if you had "age > $1 and name = $2", and rebase to 2, you expect "age > $2 and name = $3"
    // But if you just added '2', you'd get "age > $3 and name = $4"
    // So this aligns the mental model for what a rebase should be when calling the function, with the arithmetic to get there 
    rebase = rebase - 1;

    sql = sql.replace(/\$(\d+)/g, (match, p1) => {
        const number = parseInt(p1, 10);
        const incremented = number + rebase;
        return `$${incremented}`;
    });
    
    return sql;
}

/**
 * Given a parameterised sql string and its parameters, it'll shift their parameter indexes to sit above existingParameters.
 * 
 * Example:
 * Given existing parameters of ['a', 'b'], and appending: {sql: 'age > $1', parameters: [5]}, it'll return {sql: 'age > $3', parameters: [5], complete_parameters: ['a', 'b', 5]}
 * 
 * @param existingParameters 
 * @param appending 
 * @returns 
 */
export function appendSqlParameters(existingParameters: any[], appending: { sql: string, parameters: any[] }): { sql: string, parameters: any[], complete_parameters: any[] } {
    const sql = rebaseSqlParameters(appending.sql,  existingParameters.length + 1);
    return { sql, parameters: appending.parameters, complete_parameters: [...existingParameters, ...appending.parameters] };
}


/**
 * Given multiple parameterised sql strings with parameters, it combines the sql and shifts the parameter indexes so they all fit together.
 * 
 * Example:
 * If fragments = [{sql: 'age > $1', parameters: [5]}, {sql: 'name = $1', parameters: ['Bob']}] and join = ' OR ', it'll return:
 *  {sql: 'age > $1 OR name = $2', parameters: [5, 'Bob']}
 * 
 * @param fragments 
 * @param join 
 * @returns 
 */
export function concatSqlParameters(fragments:{sql: string, parameters:any[]}[], join = ' AND '):{sql: string, parameters:any[]} {
    let sqlParts:string[] = [];
    let parameters:any[] = [];
    fragments.forEach(fragment => {
        const result = appendSqlParameters(parameters, fragment);
        sqlParts.push(result.sql);
        parameters = result.complete_parameters;
    });

    return {sql: sqlParts.join(join), parameters};
}