/**
 * Goal is to be a queue that works across tabs. 
 * Despite using IndexedDB, it's not intended to be durable: it still holds its jobs in memory.
 *  The IDB is just there to enforce sequential/non-concurrent task order across tabs, if they share the same IDB. 
 * 
 * Use cases
 *  - You want to run a heavy operation only once across tabs that share data. So whichever tab picks up the job first runs it, marks it complete, and no other tab races to run it concurrently. 
 * 
 * (Potentially this can also be implemented with a Broadcast Channel API, if using IndexedDB isn't desirable - e.g. too slow/heavy)
 */

import { Dexie, Subscription, liveQuery } from "dexie";
import { IQueue,  Testing } from "../types.ts";


import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import { BaseItemQueue } from "../common/helpers/item-queue/BaseItemQueue.ts";
import { IQueueIo, QueueIoEvents, QueueItemDB } from "../common/helpers/item-queue/types.ts";
import { FakeIdb } from "../../fake-idb/types.ts";
import { uid } from "../../uid/index.ts";
import { sleep } from "../../../main/misc.ts";




export type TestingIDB = Testing & {idb?:FakeIdb, idb_with_multiple_clients?: boolean}


export class QueueIDB extends BaseItemQueue implements IQueue {
    
    

    constructor(id:string, testing?: TestingIDB) {
        super(id, new QueueIoIdb(id, testing))
        
        
    }

    isTestingIdb() {
        return (this.queueIo as QueueIoIdb).isTestingIdb();
    }


}


class QueueIoIdb extends Dexie implements IQueueIo {
    emitter: TypedCancelableEventEmitter<QueueIoEvents> = new TypedCancelableEventEmitter();
    #id: string;
    #queue: Dexie.Table<QueueItemDB, number>;
    #dexieSubscription?: Subscription;
    #testing?: Testing;
    #testing_idb: boolean
    #disposed = false;

    constructor(id:string, testing?: TestingIDB) {
        super(`queue-idb-${id}`, testing?.idb);

        this.#testing_idb = !!testing?.idb;
        
        
        this.version(1).stores({
            queue: '++id,ts,eligible_at,client_id,started_at,completed_at' 
        });
        this.#queue = this.table('queue'); // Just informing Typescript what Dexie has already done...

        this.#id = id;
        this.#addDbListener();
        this.#testing = testing;

        if( this.isTestingIdb() && !testing?.idb_with_multiple_clients ) this.#testingInitialHealthCheck();
    }

    isTestingIdb() {
        return this.#testing_idb;
    }

    async #testingInitialHealthCheck() {
        const rows = await this.#queue.toArray();
        if( rows.length>0 ) {
            console.debug(`QueueIDB [${this.#id}]  is being constructed in testing mode, but there's already ${rows.length} items in the queue. It might indicate an undesirable sharing of fake IDB. If you're intentionally testing multiple tabs, set 'idb_with_multiple_clients to true.`);
        }
    }

    async #addDbListener() {

        const observable = liveQuery(async () => this.#queue.toArray());
        
        this.#dexieSubscription = observable.subscribe({
            next: async () => {
                
                this.emitter.emit('MODIFIED');
                
            }
        })
        

        
    }

    async addItem(item:QueueItemDB):Promise<QueueItemDB> {
        const id = await this.#queue.add(item);
        
        item = {
            ...item,
            id
        }
        return item;
    }

    async listItems() {
        return this.#queue.toArray();
    }

    async nextItem(clientId:string) {
        const run_id = uid();
        let items:QueueItemDB[] | undefined;
        let firstIncompleteItem:QueueItemDB | undefined;
        let markedStarted:boolean = false;
        await this.transaction('rw', this.#queue, async () => {

            

            items = await this.#queue.orderBy('id').toArray();

            const somethingRunning = items.some(x => x.started_at && !x.completed_at);
            firstIncompleteItem = items.find(x => !x.completed_at );

            if( !somethingRunning && firstIncompleteItem && firstIncompleteItem.client_id===clientId && (firstIncompleteItem.start_after_ts < Date.now()) ) {
                const now = Date.now();
                firstIncompleteItem.run_id = run_id;
                firstIncompleteItem.started_at = now;
                if( this.#disposed ) return;
                markedStarted = (await this.#queue.update(firstIncompleteItem.id, {run_id, started_at: now}))>0;
            }
        })

        if( firstIncompleteItem && markedStarted ) {
            return {
                item: firstIncompleteItem,
                run_id
            }
        }
        return undefined;

    }

    async updateItem(itemId: number, changes:Partial<QueueItemDB>) {
        const changed = (await this.#queue.update(itemId, changes))>0;
        return changed;
    }

    async deleteItem(itemId: number) {
        await this.#queue.delete(itemId);
    }

    async completeItem(item:QueueItemDB, force?: boolean) {
        let latestItem: QueueItemDB | undefined;
        let markedComplete:boolean = false;
        await this.transaction('rw', this.#queue, async () => {
            latestItem = await this.#queue.get(item.id);
            if( !latestItem || (!force && latestItem.run_id!==item.run_id) ) {
                console.warn(`QueueIDB [${this.#id}] The job running in memory did not match the job instance ID it was started with in the db.`, {latestItem, item});
                return;
            }
            if( this.#disposed ) return;
            markedComplete = (await this.#queue.update(item.id, {completed_at: Date.now()})>0);
        });
        if( !markedComplete ) {
            throw new Error(`QueueIDB [${this.#id}] Could not mark the item as complete.\n\n${JSON.stringify({item, latestItem})}`);
        }
    }


    async countItems():Promise<number> {
        return this.#queue.where('completed_at').equals(0).count();
    }


    async dispose(clientId:string) {
        this.#disposed = true;
        if( this.#dexieSubscription ) {
            this.#dexieSubscription.unsubscribe();
        }


        await this.#queue.where('client_id').equals(clientId).delete();

        super.close();

        // Dexie's unsubscribe (and maybe close) aren't promises, but they do take time to run, breaking tests by leaving open handles. 
        await sleep(3000);
    }

}

