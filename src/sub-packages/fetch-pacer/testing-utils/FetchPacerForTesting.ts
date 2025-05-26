import FetchPacer from "../FetchPacer.ts";
import {MockPaceTracker} from './MockPaceTracker.ts';

export class FetchPacerForTesting extends FetchPacer {
    getMockPaceTracker():MockPaceTracker {
        if( !(this.paceTracker instanceof MockPaceTracker) ) throw new Error("You need to mock this at the file level first");
        return this.paceTracker as unknown as MockPaceTracker;
    }
}