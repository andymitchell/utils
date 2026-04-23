import { describe, test, expect } from 'vitest';
import {
    reindexSqlParameters,
    rebaseSqlParameters,
    appendSqlParameters,
    concatSqlParameters,
} from './sql-parameters.ts';

describe('sql-parameters', () => {

    describe('pg dialect', () => {

        test('reindex shifts $N indexes to start from the given base', () => {
            expect(reindexSqlParameters('age > $1 AND name = $2', 2, 'pg'))
                .toBe('age > $2 AND name = $3');
        });

        test('reindex preserves relative gaps between indexes', () => {
            expect(reindexSqlParameters('age > $1 AND name = $4', 2, 'pg'))
                .toBe('age > $2 AND name = $5');
        });

        test('reindex with startAt=1 is a no-op on pg (parameters already start at $1)', () => {
            expect(reindexSqlParameters('age > $1 AND name = $2', 1, 'pg'))
                .toBe('age > $1 AND name = $2');
        });

        test('append rebases SQL above existing parameters', () => {
            const result = appendSqlParameters(['a', 'b'], { sql: 'age > $1', parameters: [5] }, 'pg');

            expect(result.sql).toBe('age > $3');
            expect(result.parameters).toEqual([5]);
            expect(result.complete_parameters).toEqual(['a', 'b', 5]);
        });

        test('concat joins fragments with rebased parameters', () => {
            const result = concatSqlParameters(
                [
                    { sql: 'age > $1', parameters: [5] },
                    { sql: 'name = $1', parameters: ['Bob'] },
                ],
                'pg',
                ' AND ',
            );

            expect(result.sql).toBe('age > $1 AND name = $2');
            expect(result.parameters).toEqual([5, 'Bob']);
        });

        test('concat handles multi-param fragments without overlap', () => {
            const result = concatSqlParameters(
                [
                    { sql: '(age > $1 OR age > $2)', parameters: [5, 10] },
                    { sql: '(name = $1 OR name = $2)', parameters: ['Bob', 'Alice'] },
                ],
                'pg',
                ' AND ',
            );

            expect(result.sql).toBe('(age > $1 OR age > $2) AND (name = $3 OR name = $4)');
            expect(result.parameters).toEqual([5, 10, 'Bob', 'Alice']);
        });
    });

    describe('sqlite dialect', () => {

        test('reindex is a no-op for positional ? parameters', () => {
            expect(reindexSqlParameters('age > ? AND name = ?', 5, 'sqlite'))
                .toBe('age > ? AND name = ?');
        });

        test('append concatenates parameters without modifying SQL', () => {
            const result = appendSqlParameters(['a', 'b'], { sql: 'age > ?', parameters: [5] }, 'sqlite');

            expect(result.sql).toBe('age > ?');
            expect(result.parameters).toEqual([5]);
            expect(result.complete_parameters).toEqual(['a', 'b', 5]);
        });

        test('concat joins SQL and merges parameter arrays', () => {
            const result = concatSqlParameters(
                [
                    { sql: 'age > ?', parameters: [5] },
                    { sql: 'name = ?', parameters: ['Bob'] },
                ],
                'sqlite',
                ' AND ',
            );

            expect(result.sql).toBe('age > ? AND name = ?');
            expect(result.parameters).toEqual([5, 'Bob']);
        });

        test('concat handles multi-param fragments', () => {
            const result = concatSqlParameters(
                [
                    { sql: '(age > ? OR age > ?)', parameters: [5, 10] },
                    { sql: '(name = ? OR name = ?)', parameters: ['Bob', 'Alice'] },
                ],
                'sqlite',
                ' AND ',
            );

            expect(result.sql).toBe('(age > ? OR age > ?) AND (name = ? OR name = ?)');
            expect(result.parameters).toEqual([5, 10, 'Bob', 'Alice']);
        });
    });

    describe('edge cases', () => {

        test('empty fragments returns empty sql and parameters', () => {
            const result = concatSqlParameters([], 'pg');
            expect(result.sql).toBe('');
            expect(result.parameters).toEqual([]);
        });

        test('single fragment returns it unchanged', () => {
            const result = concatSqlParameters(
                [{ sql: 'age > $1', parameters: [5] }],
                'pg',
            );
            expect(result.sql).toBe('age > $1');
            expect(result.parameters).toEqual([5]);
        });
    });

    describe('deprecated alias `rebaseSqlParameters`', () => {

        test('behaves identically to reindexSqlParameters', () => {
            expect(rebaseSqlParameters('age > $1 AND name = $2', 3, 'pg'))
                .toBe(reindexSqlParameters('age > $1 AND name = $2', 3, 'pg'));
        });

        test('is the same function reference (zero-overhead alias)', () => {
            expect(rebaseSqlParameters).toBe(reindexSqlParameters);
        });
    });
});
