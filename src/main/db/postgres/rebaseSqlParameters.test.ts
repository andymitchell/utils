import { appendSqlParameters, concatSqlParameters, rebaseSqlParameters } from "./rebaseSqlParameters";

describe('rebaseSqlParameters', () => {

    test('rebaseSqlParameters', () => {
        const result = rebaseSqlParameters(`age > $1 and name = $2`, 2);
        expect(result).toBe(`age > $2 and name = $3`);
    });

    test('rebaseSqlParameters - stays relative', () => {
        const result = rebaseSqlParameters(`age > $1 and name = $4`, 2);
        expect(result).toBe(`age > $2 and name = $5`);
    });

    test('appendSqlParameters', () => {
        const result = appendSqlParameters(['a', 'b'], {sql: `age > $1`, parameters: [5]});

        expect(result.sql).toBe(`age > $3`);
        expect(result.parameters).toEqual([5]);
        expect(result.complete_parameters).toEqual(['a', 'b', 5]);
    });

    test('concatSqlParameters', () => {


        const result = concatSqlParameters(
            [
                {
                    sql: 'age > $1',
                    parameters: [5]
                },
                {
                    sql: 'name = $1',
                    parameters: ['Bob']
                }
            ],
            ' AND '
        )

        expect(result.sql).toBe('age > $1 AND name = $2');
        expect(result.parameters).toEqual([5, 'Bob']);

    });

    test('concatSqlParameters - no overlap', () => {


        const result = concatSqlParameters(
            [
                {
                    sql: '(age > $1 OR age > $2)',
                    parameters: [5, 10]
                },
                {
                    sql: '(name = $1 OR name = $2)',
                    parameters: ['Bob', 'Alice']
                }
            ],
            ' AND '
        )

        expect(result.sql).toBe('(age > $1 OR age > $2) AND (name = $3 OR name = $4)');
        expect(result.parameters).toEqual([5, 10, 'Bob', 'Alice']);

    });

})