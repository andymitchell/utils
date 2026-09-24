import { vi } from 'vitest';

/**
 * Runs a promise to completion under fake timers, moving the clock forward until it settles.
 *
 * With fake timers on, anything that waits on a timer never finishes by itself, so awaiting it
 * directly hangs the test. This moves time forward in small slices, letting timers fire and
 * their follow-on work run, until the promise resolves or rejects.
 *
 * @param promise The work to finish.
 * @param step How far to move the clock per slice, in ms. Smaller slices land closer to the
 * moment the promise settles; larger ones finish long waits in fewer turns.
 * @returns What `promise` resolves to; rejects with what it rejects with.
 *
 * @example
 * vi.useFakeTimers();
 * const response = await settle(pacer.fetch('https://svc/?points=1', undefined, 1));
 *
 * @remarks
 * The clock ends up to `step − 1` ms past the moment the promise settled. Never use this with
 * real timers: it would spin forever.
 */
export async function settle<T>(promise: Promise<T>, step = 10): Promise<T> {
    let done = false;
    promise.then(() => { done = true; }, () => { done = true; });
    while (!done) await vi.advanceTimersByTimeAsync(step);
    return promise;
}
