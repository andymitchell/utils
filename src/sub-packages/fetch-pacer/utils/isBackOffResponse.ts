import type { BackOffResponse } from "../types.ts";

export function isBackOffResponse(x:Response): x is BackOffResponse {
    return x instanceof Response && x.status===429;
}