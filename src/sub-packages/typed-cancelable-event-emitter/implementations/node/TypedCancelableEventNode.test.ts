
import { commonTests, type TestEvents } from '../../commonTests.ts';
import TypedCancelableEventEmitterNode from './TypedCancelableEventEmitterNode.ts';


commonTests(() => 
    // @ts-ignore TODO unignore this
    new TypedCancelableEventEmitterNode<TestEvents>()
)