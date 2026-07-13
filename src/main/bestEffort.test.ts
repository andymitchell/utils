/**
 * `bestEffort` — the generic best-effort primitive (`dec-logging-is-best-effort`). The conformance battery
 * and collection unit tests exercise it through constructor and method logging; these pin suppression directly, where
 * the hazards are easiest to see: neither a failing task NOR a failing `onError` hook — synchronous OR async —
 * may surface to the caller, and a hung task is released at the cap.
 */

import { describe, it, expect } from "vitest";
import { bestEffort } from "./bestEffort.ts";
import { sleep } from "./misc.ts";

describe("bestEffort", () => {
  it("resolves (never rejects) when the task rejects, invoking onError exactly once", async () => {
    let calls = 0;
    await expect(
      bestEffort(() => Promise.reject(new Error("task-failed")), {
        timeoutMs: 100,
        onError: () => {
          calls++;
        },
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });

  it("suppresses a synchronously-throwing task and a synchronously-throwing onError", async () => {
    await expect(
      bestEffort(
        () => {
          throw new Error("sync-task-throw");
        },
        {
          timeoutMs: 100,
          onError: () => {
            throw new Error("sync-onError-throw");
          },
        },
      ),
    ).resolves.toBeUndefined();
  });

  // The regression this guards: TS accepts an async fn for a void-returning callback, so an implementer can hand
  // bestEffort an async onError (e.g. self-reporting through an async logger). If that hook rejects, bestEffort
  // must absorb it — a leaked unhandled rejection would breach the best-effort boundary it exists to seal.
  it("suppresses an async onError that rejects — no unhandled rejection escapes", async () => {
    const leaked: unknown[] = [];
    const capture = (reason: unknown) => {
      leaked.push(reason);
    };
    process.on("unhandledRejection", capture);
    try {
      await bestEffort(() => Promise.reject(new Error("task-failed")), {
        timeoutMs: 100,
        onError: async () => {
          await Promise.resolve();
          throw new Error("async-onError-reject");
        },
      });
      await sleep(50); // give any queued unhandled rejection time to surface
      expect(
        leaked.some((r) => String(r).includes("async-onError-reject")),
      ).toBe(false);
    } finally {
      process.off("unhandledRejection", capture);
    }
  });

  it("resolves at the cap when the task hangs, rather than awaiting it", async () => {
    const winner = await Promise.race([
      bestEffort(() => new Promise<never>(() => undefined), {
        timeoutMs: 30,
      }).then(() => "capped" as const),
      sleep(500).then(() => "stalled" as const),
    ]);
    expect(winner).toBe("capped");
  });
});
