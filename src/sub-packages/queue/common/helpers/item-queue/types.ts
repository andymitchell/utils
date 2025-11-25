import { TypedCancelableEventEmitter } from "../../../../typed-cancelable-event-emitter/index.ts";
import type { BaseItem, JobItem, QueueEvents } from "../../../types.ts";


/**
 * The information needed by `BaseItemQueue` to store a job.
 * 
 * It's typically separate to, but references, the `JobItem` which is the in-memory only reference that includes the callback function. 
 */
export type BaseItemDurable = BaseItem & {
    id: number,
    attempts: number,
    client_id: string, 
    client_id_job_count: number,
    run_id?: string,
    start_after_ts: number,
    completed_at: number,
}

export type QueueIoEvents<J extends BaseItem = BaseItem> = QueueEvents<J> & {
    /**
     * This is a simple signal. The most generic option for any implementation (on some stores, finding which items changed might be complex.).
     * @returns 
     */
    MODIFIED: () => void,
}


export interface IQueueIo {
    emitter: TypedCancelableEventEmitter<QueueIoEvents>;

    addItem(item:BaseItemDurable):Promise<BaseItemDurable>
    listItems():Promise<BaseItemDurable[]>
    nextItem(clientId:string):Promise<{item:BaseItemDurable, run_id: string} | undefined>
    updateItem(itemId: number, changes:Partial<BaseItemDurable>):Promise<boolean>
    incrementAttempts(itemId: number):Promise<boolean>
    deleteItem(itemId: number):Promise<void>
    completeItem(item:BaseItemDurable, force?: boolean):Promise<void>
    countItems():Promise<number>
    dispose(clientId:string):Promise<void>
}