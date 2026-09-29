import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IQueue } from './types.ts';
import { QueueMemory } from './memory/QueueMemory.ts';
import { QueueWorkspace } from './common/QueueWorkspace.ts';

describe('what a caller waits on: exactly the type its job returns', () => {

    it('from a queue, and through the IQueue contract', async () => {
        const memory = new QueueMemory('types-test', {testing_disable_check_timeout: true});
        const asContract: IQueue = memory;

        const direct = memory.enqueue(async () => ({count: 1}));
        const viaContract = asContract.enqueue(() => 'sync result');

        expectTypeOf(direct).toEqualTypeOf<Promise<{count: number}>>();
        expectTypeOf(viaContract).toEqualTypeOf<PromiseLike<string>>();
        expect(await direct).toEqual({count: 1});
        expect(await viaContract).toBe('sync result');

        await memory.dispose();
    })

    it('from a named queue', async () => {
        const workspace = new QueueWorkspace();

        const result = workspace.enqueue('types-test', async () => [1, 2]);

        expectTypeOf(result).toEqualTypeOf<Promise<number[]>>();
        expect(await result).toEqual([1, 2]);

        await workspace.dispose();
    })

})
