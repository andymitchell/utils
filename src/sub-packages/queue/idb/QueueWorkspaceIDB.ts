
import { QueueWorkspace } from "../common/QueueWorkspace.ts";
import type { QueueFunction } from "../types.ts";
import { QueueIDB, type TestingIDB } from "./QueueIDB.ts";


export class QueueWorkspaceIDB extends QueueWorkspace {
    
    protected queueIDBs:Record<string, QueueIDB>;
    
    constructor(testing?:TestingIDB) {
        super(testing);

        this.queueIDBs = {};
        
    }


    enqueueIDB:QueueFunction = (queueName, onRun, descriptor?, halt?, enqueuedCallback?, options?) => {
        if( this.disposed ) throw new Error("QueueWorkspace is disposed. Can't enqueue.");
        if( !this.queueIDBs[queueName] ) this.queueIDBs[queueName] = new QueueIDB(queueName, options, this.testing);
        return this.queueIDBs[queueName]!.enqueue(onRun, descriptor, halt, enqueuedCallback);
    }

    override async dispose() {
        await super.dispose();
        
        const all = [...Object.values(this.queueIDBs)];
        
        this.queueIDBs = {};

        await Promise.all(all.map(x => x.dispose()));
    }
}