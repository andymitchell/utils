
import { QueueMemory } from "../memory/QueueMemory";
import { QueueFunction, Testing } from "../types";


export class QueueWorkspace {
    protected queueMemorys:Record<string, QueueMemory>;
    
    protected testing?:Testing;
    protected disposed: boolean;

    constructor(testing?:Testing) {
        this.queueMemorys = {};
        
        this.testing = testing;
        this.disposed = false;
    }

    enqueue:QueueFunction = (queueName, onRun, descriptor?, halt?, enqueuedCallback?) => {
        if( this.disposed ) throw new Error("QueueWorkspace is disposed. Can't enqueue.");
        if( !this.queueMemorys[queueName] ) this.queueMemorys[queueName] = new QueueMemory(queueName);
        return this.queueMemorys[queueName]!.enqueue(onRun, descriptor, halt, enqueuedCallback);
    }


    async dispose() {
        this.disposed = true;
        const all = [...Object.values(this.queueMemorys)];
        this.queueMemorys = {};
        

        await Promise.all(all.map(x => x.dispose()));
    }
}