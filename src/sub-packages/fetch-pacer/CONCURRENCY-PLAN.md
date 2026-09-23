# Fetch Pacer: concurrency plan (handoff)

A research report and implementation plan for making `fetch-pacer` run requests in parallel while still protecting a points quota. The motivating consumer is the Gmail API in ActiveInbox (`~/git/aib/GTDInbox`). The design is generic.

## RULES (read first; survive compaction)
- Phases below carry `[ ]` / `[x]`. Toggle with `sed -i '' 'Ns/\[ \]/[x]/' CONCURRENCY-PLAN.md` (N = line number). **Never use the Edit tool to toggle** — plan files may hold invisible U+00A0.
- When a phase completes, append `#### Lessons Learnt` under it. Phase I folds them back into this file's design sections.
- TDD, one intent at a time: write a failing test → minimal code → `npm run typecheck && npm test && npm run lint` (check `package.json` for exact script names) → next.
- **Backwards compatibility:** with no new options set, behaviour must stay "≤1 request in flight". The one deliberate exception is the Phase A bug fix. Other consumer: `~/git/api/api-chisel/src/api-generator/shared-src-template/request/` (`FetchPacerMultiClientDefault.ts`, `resolvePacerConfig.ts`, `hasGivenUpOnBackOff.ts`).
- House rules: deep modules, barrel-only exports (`index.ts`), JSDoc on every export, files < 400 LOC, errors as values where practical, no mutation of inputs.

---

## 0. Step zero — which Gmail quota applies?
Google changed Gmail API limits on **1 May 2026** (App. B). *"Cloud projects that made any use of this API between November 2025 and April 2026 will continue with their previously set usage quotas."* ActiveInbox's project is therefore **probably** on the legacy regime, but this is **unverified**.

- This means **Gmail's per-user quota on the Google Cloud project that owns GTDInbox's OAuth client ID**. It is not the ActiveInbox server, which has no quota.
- Check Cloud Console → APIs & Services → Gmail API → Quotas → "per minute per user". Also check whether per-method costs changed (for example `threads.get`: 10 legacy vs 40 new).

| Finding | Do |
|---|---|
| Legacy (15,000 u/user/min, threads.get = 10) | All phases A–I. Concurrency pays off ~2–5× (§2). |
| New (6,000 u/user/min, threads.get = 40) | Phases A, B, C, F, I only. Concurrency can't help; the pacer must *slow down*. GTDInbox must also fix its unit table and config (§5). |

The library work is useful either way; only the consumer config differs.

---

## 1. TL;DR

**Q1 — Is fetch-pacer strictly serial with no possible concurrency?**
**The library: yes, per instance. The GTDInbox app: no — it already runs Gmail requests concurrently, unpaced.**
- `FetchPacer` owns one `QueueMemory` (`FetchPacer.ts:46`). `QueueMemory` only ever runs `queue[0]` (`../queue/memory/QueueMemory.ts:112-116`), and a job paused via `preventCompletion` stays at the head, blocking all others. This holds in both 0.15.4 (what GTDInbox ships) and 0.32.1 (this source).
- In GTDInbox, the legacy `GmailApiSafeFetch` constructs **a new pacer per port, and the legacy client opens one port per request**. So every legacy Gmail request gets its own empty queue: concurrent and effectively unpaced. It runs in parallel with the main singleton pacer's queue. All instances share only a storage log that doesn't prevent overshoot (App. A).

**Q2 — Could concurrency spend Gmail quota faster than serial?**
**Legacy quota: yes, ~2–5× for thread downloads. New quota: no.**
- Serial is **latency-bound**. Each request costs 200 ms sleep + round trip, so a single stream spends ~55–100 u/s against ~250 u/s allowed (22–40 %).
- Simulated 400-thread label: **48–76 s serial → 10–23 s with 2–4 in flight** (§2).
- Under the new regime serial already overspends ~4×, so the answer is "slow down".

**Q3 — How should fetch-pacer change?** Eight moves, detailed in §3:
1. Window-exact admission, replacing coarse pauses.
2. Reserve points **at dispatch**, not on completion.
3. A concurrent scheduler with `max_concurrency` (default 1).
4. One shared coordinator per id per realm, plus an optional cross-context lock.
5. Classified refusals: *rate* versus *concurrency*.
6. Back-off floor of 1 s, with jitter; an opt-in AIMD budget that learns the real quota.
7. Cancellation.
8. Observability.

**Found on the way:** this source (0.32.1) has a throughput regression. `PaceTracker.logSuccess` imposes a cool-off that settles at **~12 % of `max_points_per_second`** (§2.3). GTDInbox upgrading from 0.15.4 to this source unchanged would be ~4× slower. Fix first (Phase A).

---

## 2. Quota maths

### 2.1 Workload
A 400-thread Gmail label is downloaded as 16 *sequential* `threads.list` pages (10 u each; page n+1 needs page n's token). Each page unlocks 2–3 batch requests of 10 × `threads.get` (100 u legacy). That is 40 batches: **56 fetches, 4,160 units** (legacy costs).

### 2.2 Serial (today) vs concurrent
Serial rate = Σ(200 ms sleep + RTT). Batch RTT is ~0.8–1.5 s, so ~55–100 u/s. The pacer never pauses at that rate, so wall clock is pure latency.

Discrete-event simulation (App. E2) of a window-exact scheduler that charges points at dispatch and allows ≤ C in flight:

| batch RTT | today (serial + 200 ms sleep) | C=2, 200/s cap | C=4, 200/s cap | C=4, 500/1 s + 12k/min | C=6, same |
|---|---|---|---|---|---|
| 0.8 s | 48 s | 23 s | 23 s | 10 s | 9 s |
| 1.5 s | 76 s | 33 s | 24 s | 17 s | 12 s |

- **Legacy quota:** the binding limits become (a) the configured points/s and (b) Gmail's undocumented per-user concurrent-request limit. The legacy quota is **per minute** (15,000 u), so a 4,160 u job fits inside one minute's budget. A per-second guard window is a safety choice, not Google's rule.
- **New quota:** the same label costs 16,160 u against 6,000 u/min. That is **≥ ~3 min whatever C is**; the simulation gives 182–188 s for C=1..4. Only fewer or cheaper calls help (caching, `history.list`, lighter formats).
- Labels (1 u each) are pure latency. Concurrency speeds them ≈×C, but they are a small share of the total.

### 2.3 The 0.32.1 cool-off regression
`PaceTracker.logSuccess` (`PaceTracker.ts:107-134`) computes, for w = 1..30 s, `(P_w / (max·w)) · w` seconds, and takes the maximum. That simplifies to **P₃₀ / max**: "wait long enough to drain *everything spent in the last 30 s* to zero", with no credit for drain that has already elapsed. At steady state with rate r and request size p: the interval is `p/r = 30r/max + RTT`.
- Fake-clock run of the real class (App. E1: max 200/s, 100 u requests, 200 ms + 800 ms per request): **~24 u/s**.
- 10 u requests at 300 ms: **~7 u/s**.
- 0.15.4 for comparison: ~87–100 u/s (latency-bound).

---

## 3. Design

### D1 — Window-exact quota model
- **Option:** `quota?: { windows: { points: number; per_ms: number }[] }`. When absent, derive `[{ points: max_points_per_second, per_ms: 1000 }]`.
- **Pure function** `earliestAdmissibleTs(log, points, windows, now): number`:
  - For each window, `used` = Σ points with `ts > now − per_ms`.
  - If `used + points ≤ limit`, the window admits now.
  - Otherwise walk its entries from oldest to newest, subtracting each from `used`, until `used + points ≤ limit`. That window admits at `entry.ts + per_ms`.
  - Result = max across windows.
- **Oversized request** (`points > limit`): admit once that window is empty. This keeps today's rule that a huge request runs once rather than never.
- **Replaces** 0.15.4's `floor(P/max) × {1 s, 15 s}` pauses (coarse, measured from now) and the D6 cool-off.
- **Log retention** must be ≥ the largest `per_ms`.

### D2 — Reserve at dispatch
- Append `{ kind: 'reserved', points, ts: dispatchTs, id }` to the log **before** calling fetch. Gmail bills on receipt.
- Today points are logged after completion (`FetchPacer.ts:140-143`). In-flight spend is invisible to any other dispatcher, which is fatal once there is concurrency.
- On 2xx, mark the entry as a success and keep its ts. On refusal, network error or abort, **keep** the points: it's conservative, and Gmail may have charged.
- Stored activities gain `kind` and `dispatched_at`. Readers must accept old records.

### D3 — Concurrent scheduler
- New internal `PacedScheduler` replaces `QueueMemory` inside `FetchPacer`.
- **State:**
  - pending FIFO
  - `inFlight`
  - `max_concurrency` (default **1**)
  - optional `max_concurrent_weight`, with per-request `concurrency_weight` (default 1). A Gmail batch of 10 inner calls should weigh 10, since the concurrent-request limit likely counts inner calls.
- **Loop:** while there is capacity and the head is admissible now (D1, and no active back-off), reserve (D2) and dispatch. Otherwise arm **one** timer for min(head admissible ts, back-off end).
- **Retries** (`attempt_recovery`) go back into pending with a not-before ts and **do not hold a slot**. Today a paused head blocks everything.
- **FIFO** is deliberate: it stops small requests starving a large one.
- **Existing semantics to keep:**
  - the `attempt_recovery` `timeout_ms` measured from job creation, with `cannot_recover` / `back_off_accumulated_ms` on the response
  - synthetic 429 responses in `429_preemptively` mode
  - `pacing_attempt`
  - `BACKING_OFF` events
  - `setActive(true/false)` on first job / empty queue

### D4 — One coordinator per id
- **Same realm:** a module-level registry `Map<storageKey, Coordinator>`. Every `FetchPacer` or `FetchPacerMultiClient` constructed with the same id shares one scheduler and tracker.
  - First options win; `console.warn` on mismatch.
  - Reference-count so that `dispose()` of the last holder tears it down.
  - **This alone fixes GTDInbox's per-request pacers.**
- **Cross-realm (same origin, e.g. several extension contexts):**
  - Optional `lock?: { withLock<T>(key: string, fn: () => Promise<T>): Promise<T> }`. The default uses `navigator.locks.request` when present.
  - The critical section is: read log → `earliestAdmissibleTs` → append reservation.
  - Today `chrome.storage.local` has no compare-and-swap, and `ActivityTrackerKvStorage`'s `#transaction` queue (`activity-trackers/ActivityTrackerKvStorage.ts:26,49-55`) serialises only within one instance.
- **No lock available:** stay optimistic. Consumers configure windows below the true limit, and D5 catches overshoot.

### D5 — Reactive fallback
- **Refusal kinds.** `treat_as_back_off` may return `{ kind: 'rate' | 'concurrency', minimumMs? }` (today `boolean | { minimumMs? }`). A plain 429 defaults to `rate`.
- **Gmail classifier** (belongs to the consumer, but ship it as a documented example):
  - 403 with `error.errors[].reason` of `rateLimitExceeded` or `userRateLimitExceeded` → `rate`
  - 429 whose body contains `concurrent requests` → `concurrency`
- **Rate refusal:**
  - Shared pause for everyone (existing `setBackOffUntilTs`).
  - Exponential back-off starting at **1 s** (today 100 ms, `PaceTracker.ts:212`), with full jitter (`back_off_calculation.jitter` exists), capped.
  - `Retry-After` still wins (exists: `utils/parseRetryAfterMs.ts`).
  - **Opt-in AIMD budget** (`adaptive?: {...}`): on each rate refusal, multiply the effective window limits by ~0.6. Recover additively (e.g. +5 % of configured per 10 s without refusal) up to the configured limit. This lets the pacer find the real quota when config is wrong (e.g. the new Gmail regime).
- **Concurrency refusal:** halve the effective concurrency (floor 1), then +1 after N clean completions. Retry after ~1 s. No long global pause.
- **Fix consecutive-refusal counting** (`PaceTracker.ts:188-189`, "back-offs after the last success"). With concurrency, a request dispatched *before* a refusal can complete *after* it and reset the count. Count a success only if it was **dispatched after** the latest refusal.
- Batch inner-part refusals keep using `logBackOff(ms)`; add an optional `kind`.
- In-flight requests cannot be recalled. D5 only stops new dispatches.

### D6 — Remove the drain-to-zero cool-off
Delete the post-success computation in `PaceTracker.logSuccess` (`PaceTracker.ts:107-134`). Keep only the log append. D1 does admission at dispatch time. This is Phase A and can ship alone: until D1 exists, a simple interim is admission via a single 1 s window.

### D7 — `minimum_time_between_fetch`
Today it is a `sleep` inside every job, retries included (`FetchPacer.ts:81`). Make it the minimum spacing between **dispatch starts**. Default unchanged (200 ms).

### D8 — Cancellation and timeout
Add `fetch(url, options, points, extra?: { signal?: AbortSignal; concurrency_weight?: number })`.
- An aborted **queued** job is removed and never fetches.
- An aborted **in-flight** job has its fetch aborted and frees its slot.
- Per-attempt timeouts already work via `FetchOptionsProvider` returning `signal: AbortSignal.timeout(...)`.

Why it matters: with concurrency, abandoned work steals slots and quota. GTDInbox has exactly this: downloads for dead ports keep running.

### D9 — Observability
- New events:
  - `DISPATCHED { points, in_flight }`
  - `WAITING { until_ts, reason: 'quota' | 'back_off' | 'concurrency' }`
  - `REFUSED { kind, status }`
- `getStats()`: in flight, pending, effective limits and concurrency.
- MV3 consumers can use `WAITING.until_ts` to decide on a keepalive. `setTimeout` does not reset a service worker's idle timer. The library must not keep anything alive itself.

### API summary (additive)
```ts
type FetchPacerOptions = PaceTrackerOptions & FetchPacerOnlyOptions & {
  max_concurrency?: number;                 // default 1
  max_concurrent_weight?: number;           // default = max_concurrency
  quota?: { windows: { points: number; per_ms: number }[] };
  adaptive?: { on_rate_refusal_multiplier?: number; recovery_step_ratio?: number; recovery_interval_ms?: number;
               concurrency?: boolean };
  lock?: { withLock<T>(key: string, fn: () => Promise<T>): Promise<T> };
};
// FetchPacer.fetch(url, options?, points?, extra?)
// FetchPacerMultiClient.fetch(url, options?, points?, clientId?, extra?)   // 4th stays clientId — don't reorder
```
Derive the `types.ts` additions from existing types; don't redeclare shapes.

### Files
- **New (internal, each < 400 LOC, with colocated tests):**
  - `scheduler/PacedScheduler.ts`
  - `quota/earliestAdmissibleTs.ts`
  - `coordination/registry.ts`
  - `coordination/webLocksLock.ts`
  - `adaptive/aimd.ts`
  - `testing-utils/FakeQuotaServer.ts`
- **Modify:** `types.ts`, `FetchPacer.ts`, `PaceTracker.ts`, `activity-trackers/ActivityTrackerKvStorage.ts`, `FetchPacerMultiClient.ts`, `index.ts` (export only the public options/types and, optionally, `webLocksLock`).

---

## 4. Implementation phases

### Phase A [ ] Fix the cool-off regression (D6)
- First, a test: `FakeQuotaServer` (fake timers; `custom_fetch_function`) with 100 u requests and 50 ms latency. Assert steady-state ≥ 90 % of `max_points_per_second` over 60 s, and that no 1 s sliding interval exceeds the max. It fails today at ~12 %.
- Then remove `PaceTracker.ts:107-134`. Replace it with an interim admission check using a 1 s sliding window at dispatch (subsumed by Phase B).
- Existing `PaceTracker.test.ts` / `FetchPacer.test.ts` "Pacing" tests will encode the old cool-off. Rewrite them to test **intent** (never exceed the window; reach throughput), not the old pause lengths.

### Phase B [ ] `earliestAdmissibleTs` (D1)
- Pure function with property tests:
  - Admitting at the returned ts never exceeds any window.
  - Admitting 1 ms earlier would exceed some window (tightness), unless the returned ts is `now`.
  - Monotonic in `points`.
  - Oversized requests admit once the window is empty.
- Wire into `FetchPacer` behind `quota.windows`, deriving from `max_points_per_second`.

### Phase C [ ] Reserve at dispatch (D2)
- Tracker schema gains `kind`/`dispatched_at` and still accepts old records.
- Test: with two jobs admitted back-to-back, the second sees the first's points before the first completes.

### Phase D [ ] `PacedScheduler` + `max_concurrency` (D3)
- All existing `FetchPacer*.test.ts` pass with the default of 1.
- New tests:
  - `in_flight ≤ max_concurrency` at all times.
  - Metamorphic: C=2 is never slower than C=1 on the same workload.
  - A paused retry does not block a later job that is admissible.
  - The `timeout_ms` / `cannot_recover` semantics are unchanged.
  - `concurrency_weight` respected.

### Phase E [ ] Shared coordinator + lock (D4)
- Two `FetchPacer`s with the same id in one realm never jointly exceed a window (checked against `FakeQuotaServer`'s own log).
- Two "realms" (two registries sharing one fake storage and a fake lock) never jointly exceed a window. Without a lock, overshoot is bounded and caught by D5.
- `dispose` is ref-counted.

### Phase F [ ] Refusal kinds, back-off floor, AIMD (D5)
- No dispatch during a rate pause, and `Retry-After` wins.
- The first back-off is ≥ 1 s.
- A concurrency refusal halves the in-flight cap, then it recovers.
- The consecutive-refusal count ignores successes dispatched before the refusal.
- AIMD: against a `FakeQuotaServer` whose real limit is 40 % of the configured one, refusals are bounded (e.g. < 5 per minute after the first minute) and throughput is ≥ 70 % of the real limit.
- Gmail classifier example tested with real Gmail error bodies (403 `userRateLimitExceeded`; 429 `Too many concurrent requests for user`).

### Phase G [ ] Spacing, cancellation, observability (D7–D9)
- An aborted queued job never fetches.
- An aborted in-flight job frees its slot.
- Spacing applies between dispatch starts.
- Events fire with correct values.

### Phase H [ ] Release + consumer migration notes
- Changelog (behaviour change: Phase A).
- Update the api-chisel template if it relied on the old cool-off.
- GTDInbox migration notes: see §5.

### Phase I [ ] Fold every Lessons Learnt back into §3 and App. C; mark this file complete.

---

## 5. GTDInbox follow-ups (consumer side, not this package)
- Upgrade from 0.15.4, which gets Phase A's fix. Stop `GmailApiSafeFetch` constructing a pacer per port (`content/js/gmailAddonLoader/chrome_backgroundPage/service-worker.js:429`) — though D4's registry also neutralises it.
- Pass `clientId` = the Gmail account. Today every account shares `gmail-api:default`, but Gmail quota is per user.
- **Legacy regime config:**
  - `quota.windows: [{ points: 12000, per_ms: 60000 }, { points: 400, per_ms: 1000 }]`
  - `max_concurrency: 3`
  - batch `concurrency_weight` = inner calls
  - `adaptive` on
  - the Gmail `treat_as_back_off`
- **New regime:** fix `content/js/serverCommunication/API/gmail/gmailAPI/requests.ts` unit costs (threads.get 40, messages.get 20, drafts.get 20). Set windows to ≤ 80 % of 6,000/min and `max_concurrency: 1`.
- Report per-part 429s from `API/multipart/processMultipart.ts` via `logBackOff` instead of failing the whole batch.
- Full GTDInbox map: `~/git/aib/GTDInbox/aib-architecture.md` §4 "Rate limiting and backoff" and "Gmail API quota".

## 6. Open questions
- What is Gmail's actual per-user concurrent-request limit? It is undocumented; community guesses of ~10–20 are unreliable. Do batch inner calls count toward it?
- Does a refused (429/403) request still consume quota units? (D2 assumes yes, to be safe.)
- For grandfathered projects, does "previously set usage quotas" also freeze per-method unit costs?
- Is Gmail's per-minute quota a sliding window or a refilled bucket? That decides whether a 1 s guard window is needed at all. Measure with the AIMD stats.

---

## Appendix A — Evidence: serial library, concurrent app
GTDInbox paths are relative to `~/git/aib/GTDInbox/`.

**Library (0.15.4 as shipped: `node_modules/@andyrmitchell/utils/dist/fetch-pacer.js`, queue in `dist/chunk-6HMQA4Y3.js`):**
- Head-only queue (`QueueMemory.next`).
- 200 ms sleep per attempt (`:329`).
- Pace pauses `floor(P/max)` × 1 s / 15 s (`:201-205`).
- 60 s log retention (`:145`).
- Back-off `100 ms·2^(n−1)` (`:258`); no `Retry-After`.
- Every non-429 response logged as success, including 403 rate errors (`:351`).
- "Hail mary" after 10 blocked checks (`:193`).
- The job completes at response headers; the body streams after, overlapping the next request.

**App:**

| Pacer | Where | Lifetime |
|---|---|---|
| New stack | `content/js/serverCommunication/API/gmail/gmailAPI/index.ts:13` | Service-worker singleton; serialises all tabs' new-stack calls |
| Legacy `GmailApiSafeFetch` | `content/js/gmailAddonLoader/chrome_backgroundPage/service-worker.js:424-429` | **New pacer per port.** `content/js/glGmail/glGmailAPI.js:701` opens a port per request. |

- **Legacy callers still live:** history sync, `getAllLabels`/`listLabels`/`getLabel` (`content/js/glGmail/reduxStopGap/glRsgActionsCreator.js:1274,1308,1368-1372`; the last fires N at once), and drafts.
- The shared `chrome.storage.local` log (`fetch_pacer_activity_tracker_gmail-api:default`) does not stop overshoot: points are logged on completion, reads are cached, and cross-instance writes can be lost.
- Each per-port pacer leaks a 20 s `setInterval`.
- No `clientId` is ever passed.

## Appendix B — Gmail quota facts (checked 2026-09-23)
Sources: [usage limits](https://developers.google.com/workspace/gmail/api/reference/quota) (live, and Wayback 2023-06 / 2025-06 / 2026-01), [resolve errors](https://developers.google.com/workspace/gmail/api/guides/handle-errors), [batch](https://developers.google.com/workspace/gmail/api/guides/batch).

| Regime | Per user | Per project | threads.get | messages.get | drafts.get | threads.list | messages.list | labels.* | history.list |
|---|---|---|---|---|---|---|---|---|---|
| ≤ 2023 | 250 u/s "moving average (allows short bursts)" | — | 10 | 5 | 5 | 10 | 5 | 1 | 2 |
| 2025 → Apr 2026 | 15,000 u/min | 1.2 M/min | 10 | 5 | 5 | 10 | 5 | 1 | 2 |
| From 1 May 2026 | 6,000 u/min | 1.2 M/min | 40 | 20 | 20 | 10 | 5 | 1 | 2 |

- New: an 80 M u/day/project billing threshold; charges for exceeding quota are "planned … later in 2026".
- A per-user concurrent-request limit exists "in addition to the per-user rate limit", shared by all clients of that user. It returns 429 `Too many requests: Too many concurrent requests for user`.
- Rate errors: 403 `rateLimitExceeded` / `userRateLimitExceeded`, as well as 429.
- Back-off guidance: `min(2^n s + rand(≤ 1000 ms), 32–64 s)`, starting ≥ 1 s.
- Batch: ≤ 100 calls (≤ 50 recommended); n calls are billed as n; the server may execute them in any order.

## Appendix E — Reproducible simulations
**E1 — 0.32.1 `PaceTracker` throughput** (run from the `breef/utils` repo root; fake clock):
```sh
bun -e 'import PaceTracker from "./src/sub-packages/fetch-pacer/PaceTracker.ts"; let now=1e12; Date.now=()=>now;
const pt=new PaceTracker("s",{max_points_per_second:200,storage:{type:"memory"}}); let used=0,s=now;
while(now-s<120000){const w=await pt.getActiveBackOffForMs(); if(w) now+=w; now+=200+800; await pt.logSuccess(100); used+=100;}
console.log((used/((now-s)/1000)).toFixed(1),"u/s"); process.exit(0)'
```
→ ~24 u/s. (With `logSuccess(10)` and `now+=200+300`: ~7 u/s.)

**E2 — Label download under a window-exact concurrent scheduler:**
```sh
bun -e '
function sim({C, rttBatch, rttList, windows}) {
  let t=0, log=[], inflight=[], pagesDone=0, pageBusy=false, ready=0, done=0;
  const room=(p,at)=>windows.every(w=>log.filter(e=>e.t>at-w.ms).reduce((a,e)=>a+e.p,0)+p<=w.pts);
  const earliest=p=>[t,...log.flatMap(e=>windows.map(w=>e.t+w.ms+0.001))].filter(x=>x>=t).sort((a,b)=>a-b).find(c=>room(p,c)) ?? Infinity;
  while(done<40){
    let job=null;
    if(!pageBusy && pagesDone<16) job={k:"list",p:10,rtt:rttList}; else if(ready>0) job={k:"batch",p:100,rtt:rttBatch};
    const nextEnd=inflight.length?Math.min(...inflight.map(j=>j.end)):Infinity;
    const at=(job && inflight.length<C)?earliest(job.p):Infinity;
    if(at<=nextEnd && at<Infinity){ t=at; log.push({t,p:job.p}); inflight.push({...job,end:t+job.rtt}); job.k==="list"?pageBusy=true:ready--; }
    else { t=nextEnd; const j=inflight.find(x=>x.end===nextEnd); inflight=inflight.filter(x=>x!==j);
      if(j.k==="list"){pageBusy=false; pagesDone++; ready+=(pagesDone%2?2:3);} else done++; }
  }
  return (t/1000).toFixed(1)+"s";
}
const W200=[{pts:200,ms:1000},{pts:12000,ms:60000}], W500=[{pts:500,ms:1000},{pts:12000,ms:60000}];
for (const rtt of [800,1500]) {
  console.log("RTT",rtt,"today",sim({C:1,rttBatch:rtt+200,rttList:500,windows:W200}));
  for (const C of [1,2,3,4,6]) console.log(" C="+C,"200/s:",sim({C,rttBatch:rtt,rttList:300,windows:W200}),"500/s+12k/min:",sim({C,rttBatch:rtt,rttList:300,windows:W500}));
}'
```
The "today" row models serial running plus the 200 ms sleep, where the quota never binds. For the new regime, scale the windows by ¼ (the batch costs 4× more): `[{pts:1200,ms:60000}]` gives ~182–188 s for C = 1–4.
