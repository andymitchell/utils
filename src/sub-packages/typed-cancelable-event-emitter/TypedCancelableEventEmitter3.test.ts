
import { commonTests } from './commonTests.ts';
import { TypedCancelableEventEmitterNode } from './index-node.ts';
import TypedCancelableEventEmitter3 from './TypedCancelableEventEmitter3.ts';


commonTests(() => new TypedCancelableEventEmitter3())