import { MAX_RUNTIME_MS } from "../consts.ts";
import type { QueueConstructorOptions, QueueTimings } from "../types.ts";



/**
 * Get standard timings for timing out, and checking for time outs 
 * @param options 
 * @returns 
 */
export function calculateTimings(options?:QueueConstructorOptions):QueueTimings {

    const max_runtime_ms = typeof options?.max_run_time_ms==='number'? options.max_run_time_ms : MAX_RUNTIME_MS;
    if( max_runtime_ms<1 ) throw new Error("max_runtime_ms needs to be greater than 5");

    let check_timeout_interval_ms = Math.round(max_runtime_ms/3);
    if( check_timeout_interval_ms<=10 ) {
        check_timeout_interval_ms = 10;
    }

    return {
        max_runtime_ms,
        check_timeout_interval_ms
    }

}