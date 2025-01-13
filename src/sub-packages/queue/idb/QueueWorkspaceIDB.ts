
import { QueueWorkspace } from "../common/QueueWorkspace";
import { QueueFunction, Testing } from "../types";
import { QueueIDB, TestingIDB } from "./QueueIDB";


export class QueueWorkspaceIDB extends QueueWorkspace {
    
    protected queueIDBs:Record<string, QueueIDB>;
    
    constructor(testing?:TestingIDB) {
        super(testing);

        this.queueIDBs = {};
        
    }


    enqueueIDB:QueueFunction = (queueName, onRun, descriptor?, halt?, enqueuedCallback?) => {
        if( this.disposed ) throw new Error("QueueWorkspace is disposed. Can't enqueue.");
        if( !this.queueIDBs[queueName] ) this.queueIDBs[queueName] = new QueueIDB(queueName, this.testing);
        return this.queueIDBs[queueName]!.enqueue(onRun, descriptor, halt, enqueuedCallback);
    }

    override async dispose() {
        await super.dispose();
        
        const all = [...Object.values(this.queueIDBs)];
        
        this.queueIDBs = {};

        await Promise.all(all.map(x => x.dispose()));
    }
}