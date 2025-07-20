import { vi } from "vitest";
import { promiseWithTrigger } from "../../main/misc.ts";
import { TypedCancelableEventEmitter3 } from "./index.ts";


export type TestEvents = {
    EVENT_123: (event: { name: string }) => void;
    EVENT_MULTI_PARAMS: (p1: string, p2: number) => void;
}

export function commonTests(testGenerator: () => TypedCancelableEventEmitter3<TestEvents>) {
    describe('core function', () => {

        test('on', async () => {

            const pwt = promiseWithTrigger<string>();
            const ee = testGenerator();
            
            ee.on('EVENT_123', (event) => {
                pwt.trigger(event.name);

            })

            setTimeout(() => {
                
                ee.emit('EVENT_123', { name: 'abc' });
            }, 1);

            const result = await pwt.promise;
            expect(result).toBe('abc');

        })

        test('on multi params', async () => {

            const pwt = promiseWithTrigger<{p1: string, p2: number}>();
            const ee = testGenerator();
            
            ee.on('EVENT_MULTI_PARAMS', (p1, p2) => {
                pwt.trigger({p1, p2});

            })

            setTimeout(() => {
                
                ee.emit('EVENT_MULTI_PARAMS', 'a', 1);
            }, 1);

            const {p1, p2} = await pwt.promise;
            expect(p1).toBe('a');
            expect(p2).toBe(1);

        })

    })

    describe('extended', () => {

        describe('onceConditionMet', () => {
            test('basic', async () => {

                const ee = testGenerator();
                const event = { name: 'abc' };
                setTimeout(() => {
                    ee.emit('EVENT_123', event);
                }, 1);
                const result = await ee.onceConditionMet('EVENT_123', (event) => true);
                expect(result.status).toBe('ok');
                expect(result.events).toEqual([[event]])
                expect(result.firstPassParam).toEqual(event);
            })
        })

    })


    describe('types', () => {

        test('basic type', async () => {

            const ee = testGenerator();
            ee.on('EVENT_123', (event) => {
                event.name;

                // @ts-expect-error cannot reference an unknown prop
                event.unknownProp
            })

            ee.on('EVENT_MULTI_PARAMS', (p1, p2) => {
                p1==='s';
                p2===0;

                // @ts-expect-error
                p1===0
                // @ts-expect-error
                p2==='s'

            })

        })

        test('can have listener for add/remove listeners', async () => {
            const ee = testGenerator();
            ee.on('newListener', (eventName, listener) => {

                eventName==='EVENT_123'

                // @ts-expect-error
                eventName==='unknown'

                if( eventName==='EVENT_123') {
                    // TODO Check parameters match by trying to use the wrong ones
                }
            })

            ee.on('removeListener', (eventName, listener) => {

                eventName==='EVENT_123'

                // @ts-expect-error
                eventName==='unknown'

            })
        })

        test('emit', async () => {

            const ee = testGenerator();
            ee.emit('EVENT_123', {name: 's'});
            ee.emit('EVENT_MULTI_PARAMS', 's', 0);

            // @ts-expect-error mismatch params
            ee.emit('EVENT_123', {name: 0});
            // @ts-expect-error mismatch params
            ee.emit('EVENT_MULTI_PARAMS', 0, 's');

            // @ts-expect-error cannot emit newListener from outside
            ee.emit('newListener', 'EVENT_123', (name:string) => null);

            // @ts-expect-error cannot emit removeListener from outside
            ee.emit('removeListener', 'EVENT_123', (name:string) => null);
            

        })

    })

    describe('new/remove listener listener', () => {
        it('should emit "newListener" when a listener is added with .on()', () => {
            const emitter = testGenerator()
            const newListenerSpy = vi.fn();
            emitter.on('newListener', newListenerSpy);

            const eventHandler = () => { };
            emitter.on('EVENT_123', eventHandler);

            expect(newListenerSpy).toHaveBeenCalled();
            expect(newListenerSpy).toHaveBeenCalledWith('EVENT_123', eventHandler);
        });

        it('should emit "newListener" when a listener is added with .addListener()', () => {
            const emitter = testGenerator()
            const newListenerSpy = vi.fn();
            emitter.on('newListener', newListenerSpy);

            const eventHandler = () => { };
            emitter.addListener('EVENT_123', eventHandler);

            expect(newListenerSpy).toHaveBeenCalled();
            expect(newListenerSpy).toHaveBeenCalledWith('EVENT_123', eventHandler);
        });

        it('should emit "removeListener" when a listener is removed with .off()', () => {
            const emitter = testGenerator()
            const removeListenerSpy = vi.fn();
            emitter.on('removeListener', removeListenerSpy);

            const eventHandler = () => { };
            emitter.on('EVENT_123', eventHandler);
            emitter.off('EVENT_123', eventHandler);

            expect(removeListenerSpy).toHaveBeenCalled();
            expect(removeListenerSpy).toHaveBeenCalledWith('EVENT_123', eventHandler);
        });

        it('should emit "removeListener" when a listener is removed with .removeListener()', () => {
            const emitter = testGenerator()
            const removeListenerSpy = vi.fn();
            emitter.on('removeListener', removeListenerSpy);

            const eventHandler = () => { };
            emitter.on('EVENT_123', eventHandler);
            emitter.removeListener('EVENT_123', eventHandler);

            expect(removeListenerSpy).toHaveBeenCalled();
            expect(removeListenerSpy).toHaveBeenCalledWith('EVENT_123', eventHandler);
        });

    });
}