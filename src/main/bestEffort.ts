/**
 * `bestEffort` — run a side-effect so it can neither throw into nor stall its caller
 *
 * E.g. useful for calling a logger
 */

/** Options for {@link bestEffort}: the wall-clock cap, and an optional one-shot fault hook. */
export interface BestEffortOptions {
  /** Wall-clock budget (ms) the caller will wait before proceeding; an unsettled task is left running detached. */
  timeoutMs: number;
  /** Invoked at most once if the task fails (throws or rejects). Its own failure — a throw, or a rejected promise from an async hook — is suppressed too. */
  onError?: (error: unknown) => void;
}

/**
 * Runs an asynchronous side effect with a wall-clock budget and no observable failure.
 *
 * Use this for optional work such as logging, where the caller should proceed whether the task succeeds, fails,
 * or never settles. Synchronous throws from `task` are treated the same as promise rejections.
 *
 * @param task - The side-effecting async operation to attempt.
 * @param opts - The timeout budget and optional failure hook.
 * @returns A promise that resolves when `task` settles or `opts.timeoutMs` elapses; it never rejects.
 *
 * @example
 * await bestEffort(() => span.log("response", context), {
 *   timeoutMs: 1000,
 *   onError: (error) => report(error),
 * });
 *
 * @remarks
 * Timeout is not cancellation. If the timeout wins, `task` is left running detached and may still complete later.
 * `onError` is called at most once when `task` throws or rejects, including after the returned promise has
 * already resolved because of a timeout. Failures from `onError` are suppressed.
 */
export function bestEffort(
  task: () => Promise<unknown>,
  opts: BestEffortOptions,
): Promise<void> {
  const { timeoutMs, onError } = opts;

  // `Promise.resolve().then(task)` — NOT `task()` — so a SYNCHRONOUS throw from `task()` becomes a rejection
  // the `.catch` can absorb, rather than escaping before any handler is attached. After the catch the attempt
  // is settled-or-suppressed and never rejects, so racing it cannot produce an unhandled rejection.
  const attempt = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (error: unknown) => {
        // onError may fail two ways and BOTH must be absorbed (it is part of the best-effort boundary):
        // a synchronous throw, caught here; and — since TS accepts an async fn for a void-returning
        // callback — a rejected promise, swallowed by adopting its result. Without the latter, a
        // third-party self-reporting through a broken async logger would leak an unhandled rejection.
        try {
          void Promise.resolve(onError?.(error)).catch(() => undefined);
        } catch {
          /* a synchronously-throwing onError must not surface either */
        }
      },
    );

  return new Promise<void>((resolve) => {
    // Clearable timer (not a shared delay helper) so the success path leaves no dangling handle. If the cap
    // wins, the task is left running detached (it never rejects, so no unhandled rejection); resolve() is
    // idempotent, so a late task settlement after the cap is a harmless no-op.
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      timer = undefined;
      resolve();
    }, timeoutMs);
    void attempt.then(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      resolve();
    });
  });
}
