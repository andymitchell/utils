import { QueueFunction, QueueIDB, QueueMemory} from ".";
import { Testing } from "./types";


export class QueueWorkspace {
    private queueMemorys:Record<string, QueueMemory>;
    private queueIDBs:Record<string, QueueIDB>;
    private testing?:Testing;
    private disposed: boolean;

    constructor(testing?:Testing) {
        this.queueMemorys = {};
        this.queueIDBs = {};
        this.testing = testing;
        this.disposed = false;
    }

    enqueue:QueueFunction = (queueName, onRun, descriptor?, halt?, enqueuedCallback?) => {
        if( this.disposed ) throw new Error("QueueWorkspace is disposed. Can't enqueue.");
        if( !this.queueMemorys[queueName] ) this.queueMemorys[queueName] = new QueueMemory(queueName, this.testing);
        return this.queueMemorys[queueName]!.enqueue(onRun, descriptor, halt, enqueuedCallback);
    }

    enqueueIDB:QueueFunction = (queueName, onRun, descriptor?, halt?, enqueuedCallback?) => {
        if( this.disposed ) throw new Error("QueueWorkspace is disposed. Can't enqueue.");
        if( !this.queueIDBs[queueName] ) this.queueIDBs[queueName] = new QueueIDB(queueName, this.testing);
        return this.queueIDBs[queueName]!.enqueue(onRun, descriptor, halt, enqueuedCallback);
    }

    async dispose() {
        this.disposed = true;
        const all = [...Object.values(this.queueMemorys), ...Object.values(this.queueIDBs)];
        this.queueMemorys = {};
        this.queueIDBs = {};

        await Promise.all(all.map(x => x.dispose()));
    }
}