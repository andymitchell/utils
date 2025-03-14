import {TypedCancelableEventEmitter} from './TypedCancelableEventEmitter.ts';

describe('types', () => {

    test('basic type', () => {

        type TestEvents = {
            EVENT_123: (event: {name: string}) => void;
        }

        const ee = new TypedCancelableEventEmitter<TestEvents>();
        ee.on('EVENT_123', (event) => {
            event.name;
        })
        
        

    })

})