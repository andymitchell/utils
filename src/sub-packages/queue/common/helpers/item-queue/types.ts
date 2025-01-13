import { TypedCancelableEventEmitter } from "../../../../typed-cancelable-event-emitter";


export type QueueItemDB = {
    id: number,
    ts: number,
    client_id: string, 
    job_id: string,
    client_id_job_count: number,
    descriptor?: string,
    run_id?: string,
    start_after_ts: number,
    started_at?: number,
    completed_at: number,
}

export type QueueIoEvents = {
    /**
     * This is a simple signal. The most generic option for any implementation (on some stores, finding which items changed might be complex.).
     * @returns 
     */
    MODIFIED: () => void,
}


export interface IQueueIo {
    emitter: TypedCancelableEventEmitter<QueueIoEvents>;

    addItem(item:QueueItemDB):Promise<QueueItemDB>
    listItems():Promise<QueueItemDB[]>
    nextItem(clientId:string):Promise<{item:QueueItemDB, run_id: string} | undefined>
    updateItem(itemId: number, changes:Partial<QueueItemDB>):Promise<boolean>
    deleteItem(itemId: number):Promise<void>
    completeItem(item:QueueItemDB, force?: boolean):Promise<void>
    countItems():Promise<number>
    dispose(clientId:string):Promise<void>
}