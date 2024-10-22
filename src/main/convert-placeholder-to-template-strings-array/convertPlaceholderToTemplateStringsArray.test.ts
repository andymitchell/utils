import { describe, it, expect } from 'vitest';
import convertPlaceholderToTemplateStringsArray from './convertPlaceholderToTemplateStringsArray';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import * as util from 'util';
import applyPlaceholderToTemplateStringFunction from './applyPlaceholderToTemplateStringFunction';

describe('convertPlaceholderToTemplateStringsArray', () => {
    
    it('should split the placeholder string into parts for simple SELECT query', () => {
        const placeholderString = "SELECT * FROM users WHERE id = $1 AND updated_at > $2";
        const result = convertPlaceholderToTemplateStringsArray(placeholderString);
        
        expect(result).toHaveLength(3);
        expect(result[0]).toBe("SELECT * FROM users WHERE id = ");
        expect(result[1]).toBe(" AND updated_at > ");
        expect(result[2]).toBe("");
    });
    
    it('should handle INSERT query with multiple placeholders', () => {
        const placeholderString = "INSERT INTO users (id, name) VALUES ($1, $2)";
        const result = convertPlaceholderToTemplateStringsArray(placeholderString);
        
        expect(result).toHaveLength(3);
        expect(result[0]).toBe("INSERT INTO users (id, name) VALUES (");
        expect(result[1]).toBe(", ");
        expect(result[2]).toBe(")");
    });

    it('should handle UPDATE query with multiple placeholders', () => {
        const placeholderString = "UPDATE users SET name = $1 WHERE id = $2";
        const result = convertPlaceholderToTemplateStringsArray(placeholderString);
        
        expect(result).toHaveLength(3);
        expect(result[0]).toBe("UPDATE users SET name = ");
        expect(result[1]).toBe(" WHERE id = ");
        expect(result[2]).toBe("");
    });

});




describe('test a template string function (a fake sql, as that is most common)', () => {

    type SQL<T> = {
        query: string;
        params: any[];
        prepared?: string;
    };

    function testSql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T> {
        //params = Array.isArray(params[0]) && params.length === 1 ? params[0] : params;


        const query = strings.reduce((acc, str, i) => acc + str + (params[i] !== undefined ? `$${i + 1}` : ''), '');


        // Compile it. Not this does NOT do any safety escaping. It's just for test purposes. 
        const prepared = strings.reduce((acc, str, i) => acc + str + (params[i] !== undefined ? params[i] : ''), '');


        return {
            query,
            params,
            prepared
        };
    }



    it('should return the same result when using convertPlaceholderToTemplateStringsArray and tagged template literal', () => {
        const placeholderString = "SELECT * FROM users WHERE id = $1 AND updated_at > $2";
        const templateArray = convertPlaceholderToTemplateStringsArray(placeholderString);

        const resultWithFunction = testSql(templateArray, 1, '2024-01-01');
        const resultWithLiteral = testSql`SELECT * FROM users WHERE id = ${1} AND updated_at > ${'2024-01-01'}`;


        expect(resultWithFunction.query).toBe(resultWithLiteral.query);
        expect(resultWithFunction.params).toEqual(resultWithLiteral.params);
        expect(resultWithFunction.prepared).toBe(resultWithLiteral.prepared);

        expect(resultWithFunction.prepared).toBe("SELECT * FROM users WHERE id = 1 AND updated_at > 2024-01-01");
    });

    it('should correctly format a simple INSERT query with placeholders', () => {
        const templateArray = convertPlaceholderToTemplateStringsArray("INSERT INTO users (id, name) VALUES ($1, $2)");
        
        const resultWithFunction = testSql(templateArray, 1, 'John');
        const resultWithLiteral = testSql`INSERT INTO users (id, name) VALUES (${1}, ${'John'})`;

        expect(resultWithFunction.query).toBe(resultWithLiteral.query);
        expect(resultWithFunction.params).toEqual(resultWithLiteral.params);
        expect(resultWithFunction.prepared).toBe(resultWithLiteral.prepared);

        expect(resultWithFunction.prepared).toBe("INSERT INTO users (id, name) VALUES (1, John)");
    });

    it('should correctly format an UPDATE query with placeholders', () => {
        const templateArray = convertPlaceholderToTemplateStringsArray("UPDATE users SET name = $1 WHERE id = $2");
        
        const resultWithFunction = testSql(templateArray, 'John', 1);
        const resultWithLiteral = testSql`UPDATE users SET name = ${'John'} WHERE id = ${1}`;

        expect(resultWithFunction.query).toBe(resultWithLiteral.query);
        expect(resultWithFunction.params).toEqual(resultWithLiteral.params);
        expect(resultWithFunction.prepared).toBe(resultWithLiteral.prepared);


        expect(resultWithFunction.prepared).toBe("UPDATE users SET name = John WHERE id = 1");
    });

});

describe('drizzle sql function', () => {

    it(`output should match drizzle's sql function`, () => {

        const usersTable = 'users';
        const id = 12;

        const placeholderString = "select * from $1 where id = $2";
        const params = [usersTable, id];
        const templateArray = convertPlaceholderToTemplateStringsArray(placeholderString);
        
        const pgDialect = new PgDialect();
        const query1 = pgDialect.sqlToQuery(sql`select * from ${usersTable} where id = ${id}`);
        const query2 = pgDialect.sqlToQuery(sql(templateArray, ...params));
        const query3 = pgDialect.sqlToQuery(applyPlaceholderToTemplateStringFunction(sql, placeholderString, params))
        
        //console.log( testingLogDeepObject({query1, query2, templateArray}));

        expect(query1.sql).toBe(placeholderString);
        expect(query1.params).toEqual(params);
        
        expect(query2.sql).toBe(placeholderString);
        expect(query2.params).toEqual(params);

        expect(query3.sql).toBe(placeholderString);
        expect(query3.params).toEqual(params);

    });
})

