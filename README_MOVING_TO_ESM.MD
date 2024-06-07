# Utils

A collection of small helpful functions. 

## Building

- `npm run build_release` Will run the lint (failing if it gives any warnings), build it, and deploy with np


## TODO

The goal is to make sub-packages be separate, and not includes in the main/index file for @andyrmitchell/utils. 
That's because some of them are heavy (e.g. using react), and if the consumer is using commonjs then it doesn't seem to tree-shake effectively. 

Initially I had the consumer try to: 
import { TypedCancelableEventEmitter } from "@andyrmitchell/utils/dist/typed-cancelable-event-emitter";
But this broke Jest in the consumer, who couldn't resolve it. 

