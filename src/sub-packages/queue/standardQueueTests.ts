

import { sleep } from "../../main";
import { Queue } from "./types";

export default function implementationQueueTests(test: jest.It, expect: jest.Expect, createQueue: () => Queue) {
    test('Queue basic', async () => {

        const queue = createQueue();

        const state = {run1: false};
        const st = Date.now();
        await queue('TEST_RUN', async () => {
            //console.log("Queue run time: "+(Date.now()-st));
            state.run1 = true;
        });


        expect(state.run1).toBe(true);
    }, 1000*10)
    

    test('Queue 3x runs', async () => {

        const queue = createQueue();

        const state = {run1: false, run2: false, run3: false};
        queue('TEST_RUN', async () => {
            state.run1 = true;
        });
        queue('TEST_RUN', async () => {
            state.run2 = true;
        });
        queue('TEST_RUN', async () => {
            state.run3 = true;
        });


        
        await new Promise<void>(resolve => {
            const st = Date.now();
            const timer = setInterval(() => {
                const duration = Date.now()-st;
                if( state.run1 && state.run2 && state.run3) {
                    //console.log("Queue 3x run time: "+duration);
                    clearInterval(timer);
                    resolve();
                }
                if( duration > 4000 ) {
                    //console.warn("Queue 3x timed out");
                    clearInterval(timer);
                    resolve();
                }
            }, 10);
        })

        expect(state.run1).toBe(true);
        expect(state.run2).toBe(true);
        expect(state.run3).toBe(true);
    })
    
    test('Queue returns', async () => {

        const queue = createQueue();

        
        const result = await queue('TEST_RUN', async () => {
            return "The Test ABC";
        });
        

        expect(result).toBe("The Test ABC");
    })
    
    test('Queue throws async error', async () => {

        const queue = createQueue();

        let error: Error | undefined;
        try {
            const result = await queue('TEST_RUN', async () => {
                throw new Error("Bad Test ABC");
            });
        } catch(e) {
            if( e instanceof Error ) {
                error = e;
            }
        }
        
        expect(error!.message).toBe("Bad Test ABC");
    })


    test('Queue throws async error when enqueued/delayed', async () => {

        const queue = createQueue();

        const state = {run1: 0, run2: 0};

        queue('TEST_RUN', async () => {
            await sleep(200);
            state.run1 = Date.now();
            await sleep(200);
        });

        let error: Error | undefined;
        try {
            const result = await queue('TEST_RUN', async () => {
                state.run2 = Date.now();
                throw new Error("Bad Test ABC 2");
            });
        } catch(e) {
            if( e instanceof Error ) {
                error = e;
            }
        }
        
        expect(state.run1>0).toBe(true);
        expect(state.run2>0).toBe(true);
        expect(state.run2>state.run1).toBe(true);

        expect(error!.message).toBe("Bad Test ABC 2");
    })

    test('Queue throws non-async error', async () => {

        const queue = createQueue();

        let error: Error | undefined;
        try {
            const result = await queue('TEST_RUN', () => {
                throw new Error("Bad Test ABC 3");
            });
        } catch(e) {
            if( e instanceof Error ) {
                error = e;
            }
        }
        
        expect(error!.message).toBe("Bad Test ABC 3");
    })

    /*
    test('Queue does not propogate non-awaited async error', async () => {

        const queue = createQueue();

        let error: Error | undefined;
        try {
            queue('TEST_RUN', async () => {
                throw new Error("Intentional Uncaught Error In Promise");
            });
        } catch(e) {
            if( e instanceof Error ) {
                error = e;
            }
        }

        await sleep(200);
        
        expect(error).toBe(undefined);
    })
    */
}