import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseItemQueue } from './BaseItemQueue.ts';
import type { BaseItemDurable, IQueueIo, QueueIoEvents } from './types.ts';
import { TypedCancelableEventEmitter } from '../../../../typed-cancelable-event-emitter/index.ts';
import { uid } from '../../../../uid/uid.ts';
import { promiseWithTrigger } from '../../../../../main/misc.ts';
import { rejectionOf } from '../../rejectionOf.ts';

/**
 * A store held in memory, for one client, that can be told to fail when a job is marked complete
 * (as a closed database or a lost connection would).
 */
class InMemoryQueueIo implements IQueueIo {
    emitter = new TypedCancelableEventEmitter<QueueIoEvents>();
    #items: BaseItemDurable[] = [];
    #nextId = 1;
    #completionFailure?: {error: unknown};

    failCompletionWith(error: unknown): void {
        this.#completionFailure = {error};
    }

    async addItem(item: BaseItemDurable): Promise<BaseItemDurable> {
        const added = {...item, id: this.#nextId++};
        this.#items = [...this.#items, added];
        this.emitter.emit('MODIFIED');
        return added;
    }
    async listItems(): Promise<BaseItemDurable[]> {
        return [...this.#items];
    }
    async nextItem(clientId: string) {
        const somethingRunning = this.#items.some(x => x.started_at && !x.completed_at);
        const next = this.#items.find(x => !x.completed_at);
        if( somethingRunning || !next || next.client_id!==clientId || next.start_after_ts>=Date.now() ) return undefined;
        const run_id = uid();
        await this.updateItem(next.id, {run_id, started_at: Date.now()});
        return {item: {...next, run_id}, run_id};
    }
    async updateItem(itemId: number, changes: Partial<BaseItemDurable>): Promise<boolean> {
        if( !this.#items.some(x => x.id===itemId) ) return false;
        this.#items = this.#items.map(x => x.id===itemId? {...x, ...changes} : x);
        this.emitter.emit('MODIFIED');
        return true;
    }
    async deleteItem(itemId: number): Promise<void> {
        this.#items = this.#items.filter(x => x.id!==itemId);
    }
    async completeItem(item: BaseItemDurable): Promise<void> {
        if( this.#completionFailure ) throw this.#completionFailure.error;
        await this.updateItem(item.id, {completed_at: Date.now()});
    }
    async countItems(): Promise<number> {
        return this.#items.filter(x => !x.completed_at).length;
    }
    async dispose(): Promise<void> {}
}

function newQueueOverFailingStore(storeError: unknown): BaseItemQueue {
    const store = new InMemoryQueueIo();
    store.failCompletionWith(storeError);
    return new BaseItemQueue(uid(), store, {testing_disable_check_timeout: true});
}

describe('a job whose completion the store cannot record', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    })

    it('gives the caller of a job that failed the job\'s own error, untouched, and reports the store\'s', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const storeError = new Error('database closed');
        const queue = newQueueOverFailingStore(storeError);
        const thrown = new Error('vault down');

        const rejection = await rejectionOf(queue.enqueue(async () => { throw thrown; }, 'sign-in'));

        expect(rejection).toBe(thrown);
        expect(thrown.message).toBe('vault down');
        expect(storeError.message).toBe('database closed');
        expect(warn).toHaveBeenCalledWith(expect.any(String), {descriptor: 'sign-in', storeError});
    })

    it('tells the caller of a job that succeeded that it could not be recorded, with the store\'s error untouched', async () => {
        const storeError = new Error('database closed');
        const queue = newQueueOverFailingStore(storeError);

        const rejection = await rejectionOf(queue.enqueue(async () => 'sent', 'send-email'));

        expect(rejection).toBe(storeError);
        expect(storeError.message).toBe('database closed');
    })

    it('rejects even when the store fails with a falsy value', async () => {
        const queue = newQueueOverFailingStore(undefined);

        const rejection = await rejectionOf(queue.enqueue(async () => 'sent'));

        expect(rejection).toBeUndefined();
    })

    it('gives the caller of a halted job the queue\'s reason, not the store\'s error', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const queue = newQueueOverFailingStore(new Error('database closed'));
        const started = promiseWithTrigger<void>();
        const release = promiseWithTrigger<void>();
        const halt = promiseWithTrigger<void>();

        const job = rejectionOf(queue.enqueue(async () => {
            started.trigger();
            await release.promise;
        }, 'send-email', halt.promise));
        await started.promise;
        halt.trigger();

        expect(await job).toBe('Externally halted. [descriptor: send-email]');
        release.trigger();
    })

})
