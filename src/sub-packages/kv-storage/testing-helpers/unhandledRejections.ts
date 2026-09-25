import { onTestFinished } from "vitest";

/** Collects every promise rejection nothing handles, until the current test finishes. */
export function recordUnhandledRejections(): unknown[] {
    const reasons: unknown[] = [];
    const record = (reason: unknown) => reasons.push(reason);
    process.on('unhandledRejection', record);
    onTestFinished(() => { process.off('unhandledRejection', record) });
    return reasons;
}

/** Resolves after the current macrotask, by which time Node has reported any unhandled rejection. */
export function nextMacrotask(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
