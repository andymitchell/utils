import { describe, test, expect } from 'vitest';
import { concatSqlParameters } from './sql-parameters.ts';

describe('sql-parameters live', () => {

    describe('PgLite', () => {
        test('concat produces a valid multi-fragment WHERE clause', async () => {
            const { PGlite } = await import('@electric-sql/pglite');
            const db = new PGlite();

            await db.exec(`
                CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, age INT);
                INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25), ('Carol', 35);
            `);

            const where = concatSqlParameters(
                [
                    { sql: 'age > $1', parameters: [26] },
                    { sql: 'name = $1', parameters: ['Alice'] },
                ],
                'pg',
                ' AND ',
            );

            const result = await db.query(`SELECT name FROM users WHERE ${where.sql}`, where.parameters);
            expect(result.rows).toEqual([{ name: 'Alice' }]);

            await db.close();
        });
    });

    describe('@libsql/client', () => {
        test('concat produces a valid multi-fragment WHERE clause', async () => {
            const { createClient } = await import('@libsql/client');
            const db = createClient({ url: ':memory:' });

            await db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)`);
            await db.execute({ sql: `INSERT INTO users (name, age) VALUES (?, ?)`, args: ['Alice', 30] });
            await db.execute({ sql: `INSERT INTO users (name, age) VALUES (?, ?)`, args: ['Bob', 25] });
            await db.execute({ sql: `INSERT INTO users (name, age) VALUES (?, ?)`, args: ['Carol', 35] });

            const where = concatSqlParameters(
                [
                    { sql: 'age > ?', parameters: [26] },
                    { sql: 'name = ?', parameters: ['Alice'] },
                ],
                'sqlite',
                ' AND ',
            );

            const result = await db.execute({ sql: `SELECT name FROM users WHERE ${where.sql}`, args: where.parameters });
            expect(result.rows).toEqual([{ name: 'Alice' }]);
        });
    });
});
