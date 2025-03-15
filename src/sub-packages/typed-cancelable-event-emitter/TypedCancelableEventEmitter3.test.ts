import { promiseWithTrigger } from '../../index-browser.ts';
import { TypedCancelableEventEmitterNode } from './index-node.ts';
import TypedCancelableEventEmitter3 from './TypedCancelableEventEmitter3.ts';

type TestEvents = {
    EVENT_123: (event: {name: string}) => void;
}

describe('core function', () => {

    test('on', async () => {

        const pwt = promiseWithTrigger<string>();
        const ee = new TypedCancelableEventEmitter3<TestEvents>();
        ee.on('EVENT_123', (event) => {
            pwt.trigger(event.name);
            
        })

        setTimeout(() => {
            ee.emit('EVENT_123', {name: 'abc'});
        }, 1);

        const result = await pwt.promise;
        expect(result).toBe('abc');

    })

})

describe('extended', () => {

    describe('onceConditionMet', () => {
        test('basic', async () => {

            const ee = new TypedCancelableEventEmitter3<TestEvents>();
            setTimeout(() => {
                ee.emit('EVENT_123', {name: 'abc'});
            }, 1);
            const result = await ee.onceConditionMet('EVENT_123', (event) => true);
            expect(result.status).toBe('ok');
        })
    })

})


describe('types', () => {

    test('basic type', async () => {

    
        const ee = new TypedCancelableEventEmitter3<TestEvents>();
        ee.on('EVENT_123', (event) => {
            event.name;
        })
        

        
        
        
        

    })

})