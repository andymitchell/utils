import type { BackOffResponse } from "../types.ts";

/**
 * Check if a response is a back off, which will have been augmented with details in `BackOffResponse`
 * @param x 
 * @returns 
 */
export function isBackOffResponse(x:Response): x is BackOffResponse {
    return x instanceof Response && x.status===429;
}