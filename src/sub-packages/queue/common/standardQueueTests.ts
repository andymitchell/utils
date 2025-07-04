
import { promiseWithTrigger, sleep } from "../../../main/misc.ts";
import type { IQueue, QueueFunction } from "../types.ts";

export function standardQueueTests(test: jest.It, expect: jest.Expect, createQueueFunction: () => QueueFunction, createQueue: () => Promise<IQueue>) {
    
    test('Queue basic', async () => {

        const queue = createQueueFunction();

        const state = {run1: false, attempt: -1};
        const st = Date.now();
        await queue('TEST_RUN', async (job) => {
            console.log("Queue run time: "+(Date.now()-st));
            state.run1 = true;
            state.attempt = job.attempt;
        });

        


        expect(state.run1).toBe(true);
        expect(state.attempt).toBe(0);
    }, 1000*15)
    

    test('Queue is sequential', async () => {
        const queue = createQueueFunction();

        const st = Date.now();
        const state:{q1_finished_ts?: number, q2_finished_ts?: number} = {
            q1_finished_ts: undefined,
            q2_finished_ts: undefined
        }
        const addedFirst = promiseWithTrigger<void>();
        queue('TEST_SEQUENTIAL', async () => {
            await sleep(200);
            state.q1_finished_ts = Date.now();
        }, 'test1', undefined, addedFirst.trigger);
        await addedFirst.promise;
        await queue('TEST_SEQUENTIAL', async () => {
            await sleep(200);
            state.q2_finished_ts = Date.now();
        }, 'test2');

        expect(state.q2_finished_ts!>0).toBe(true);
        const secondRunTime = (state.q2_finished_ts!-state.q1_finished_ts!);
        expect(secondRunTime>=200).toBe(true);
        expect((state.q2_finished_ts!-st)>=400).toBe(true);

    }, 1000*10)

    test('Queue 3x runs', async () => {

        const queue = createQueueFunction();

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


    test('Queue 2x runs even slow', async () => {

        const queue = createQueueFunction();

        const state = {run1: false, run2: false};
        queue('TEST_RUN', async () => {
            await sleep(200);
            state.run1 = true;
        });
        queue('TEST_RUN', async () => {
            await sleep(200);
            state.run2 = true;
        });


        
        await new Promise<void>(resolve => {
            const st = Date.now();
            const timer = setInterval(() => {
                const duration = Date.now()-st;
                if( state.run1 && state.run2) {
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
    })
    
    test('Queue returns', async () => {

        const queue = createQueueFunction();

        
        const result = await queue('TEST_RUN', async () => {
            return "The Test ABC";
        });
        

        expect(result).toBe("The Test ABC");
    })
    
    test('Queue throws async error', async () => {

        const queue = createQueueFunction();

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

        const queue = createQueueFunction();

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

        const queue = createQueueFunction();

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
    
    

    test('Queue halt - while running', async () => {

        const SLEEP_TIME = 1500;

        
        const queue = createQueueFunction();

        const startedRun1 = promiseWithTrigger<void>();
        const halt = promiseWithTrigger<void>();
        const state = {run1: false, run2: false};
        
        let startSleep: number | undefined;
        let errorThrown = false;
        queue('TEST_RUN', async () => {
            startedRun1.trigger();
            startSleep = Date.now();
            await sleep(SLEEP_TIME);
            state.run1 = true;
        }, undefined, halt.promise).catch(e => {
            errorThrown = true;
        });

        const runPromise2 = queue('TEST_RUN', async () => {
            state.run2 = true;
        });

        await startedRun1.promise;
        halt.trigger();
        const oneEndedAt = Date.now();

        await runPromise2;
        const twoEndedAt = Date.now();

        expect(state.run2).toBe(true); 
        
        expect(errorThrown).toBe(true);

        // Even though queue item 1's function takes time to run, two should have begun immediately after the one is halted
        const timeBetweenTests = Math.abs(oneEndedAt!-twoEndedAt);
        expect(timeBetweenTests<500).toBe(true); // IDB can be slow, but as long as it's less than SLEEP_TIME it's ok

        // Let the test runner know something might not be finished yet
        await sleep(SLEEP_TIME-(Date.now()-startSleep!));
    }, 1000*15)
    
    
    test('Queue halt - never runs second', async () => {

        const SLEEP_TIME = 1500;
        let startSleep: number | undefined;

        const queue = createQueueFunction();

        const startedRun1 = promiseWithTrigger<void>();
        const halt = promiseWithTrigger<void>();
        const state = {run1: false, run2: false};
        
        const runPromise1 = queue('TEST_RUN', async () => {
            startedRun1.trigger();
            startSleep = Date.now();
            await sleep(SLEEP_TIME);
            state.run1 = true;
        });

        let errorThrown = false;
        let errorPromise = promiseWithTrigger<void>();
        queue('TEST_RUN', async () => {
            state.run2 = true;
        }, undefined, halt.promise).catch(e => {
            errorThrown = true;
            errorPromise.trigger();
        })

        await startedRun1.promise;
        halt.trigger();

        await errorPromise.promise;
        await runPromise1;

        expect(state.run1).toBe(true);
        expect(state.run2).toBe(false); 
        
        expect(errorThrown).toBe(true);
        
        // Let the test runner know something might not be finished yet
        await sleep(SLEEP_TIME-(Date.now()-startSleep!));
    }, 1000*15)

    test('Queue - cancels', async () => {

        const queue = createQueueFunction();

        const startedRun2 = promiseWithTrigger<void>();
        const state = {precheckCount: 0, run1: false, run2: false};

        const precheck = () => {
            const precheckCount = state.precheckCount;
            state.precheckCount++;
            if( precheckCount===0 ) {
                throw new Error("Cancelling");
            } else {
                return {proceed: true};
            }
        }
        
        queue('TEST_RUN', async () => {
            precheck();
            state.run1 = true;
        }, 'Run 1').catch(e => null);

        queue('TEST_RUN', async () => {
            precheck();
            startedRun2.trigger();
            state.run2 = true;
        }, 'Run 2');


        await startedRun2.promise;
        
        expect(state.run1).toBe(false);
        expect(state.run2).toBe(true); 
        expect(state.precheckCount).toBe(2);
        
    })


    test('Queue preventCompletion', async () => {

        const queue = createQueueFunction();

        const wait_for_ms = 200;
        const startedRun2 = promiseWithTrigger<void>();
        const state = {run1Attempts: 0, run1aborted: false, run1: false, run2: false};

        const job1AttemptLogger:number[] = [];

        const st = Date.now();
        queue('TEST_RUN', async (job) => {
            job1AttemptLogger.push(job.attempt);
            state.run1Attempts++;
            if( state.run1Attempts<=1 ) {
                state.run1aborted = true;
                job.preventCompletion(wait_for_ms);
                return;
            }

            

            state.run1 = true;
        }, 'Run 1').catch(e => null);

        queue('TEST_RUN', async (job) => {
            startedRun2.trigger();
            
            state.run2 = true;
        }, 'Run 2');


        await startedRun2.promise;
        
        expect(state.run1).toBe(true);
        expect(state.run2).toBe(true);
        expect(state.run1aborted).toBe(true);
        expect(state.run1Attempts).toBe(2);

        expect(job1AttemptLogger).toEqual([0,1]);

        const duration = Date.now()-st;
        expect(duration).toBeGreaterThan(wait_for_ms);
        //expect(duration).toBeLessThan(wait_for_ms*3);
        
    }, 1000*10)

    test('Queue preventCompletion - returns correctly after delay (second run)', async () => {

        const queue = createQueueFunction();

        const wait_for_ms = 50;
        let runCount = 0;

        
        const result = await queue('TEST_RUN', async (job) => {
            runCount++;
            if( runCount<=1 ) {
                job.preventCompletion(wait_for_ms);
            }

            return {count: runCount};
            
        }, 'Run 1');


        expect(result.count).toBe(2); // Expect it to use the final returned value
        
        
    })


    test('Queue count', async () => {

        const queue = await createQueue();

        
        const complete = queue.enqueue(async (job) => {
            await sleep(50);
        }, 'Run 1');


        expect(await queue.count()).toBe(1);

        await complete;

        expect(await queue.count()).toBe(0);
        
        
    })

}