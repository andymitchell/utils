# Utils

A collection of small helpful functions. 

## Compatibility

Requires **`zod` `^4`** as a peer dependency; a project still on zod 3 must upgrade to zod 4
first. Breaking changes between versions are listed in [`CHANGELOG.md`](CHANGELOG.md).

## Rate limiting (`fetch-pacer`)

`FetchPacer` and `FetchPacerMultiClient` pace requests against a quota and back off when a
service refuses one.

### Pacing against a quota

- A request's `points` are charged the moment it is sent and count against
  `max_points_per_second` for the next second. A request waits only until enough of that spend
  has dropped out for it to fit; one larger than the whole quota goes once nothing else is in
  the window. A refused or failed request keeps its charge, as the service may have metered it.
- `minimum_time_between_fetch` (default 200 ms) is the gap from one send to the next. The first
  request goes at once, and time already spent waiting counts towards the gap.
- `mode` decides what happens to a request that the quota or a refusal pause still holds back
  once that gap has passed. `429_preemptively` answers it with a synthetic 429, unsent, whose
  `back_off_for_ms` says when it would fit. `attempt_recovery` holds it and sends it once it
  can go, and retries a refused request the same way, until waiting any longer would pass
  `timeout_ms`; its answer is then marked `cannot_recover`. Unset or 0, `timeout_ms` sets no limit.
- `back_off_calculation: { type: 'exponential', initial_back_off_ms }` sets the pause after the
  first refusal (default 100 ms), doubling with each further refusal until a success.
- Several pacers can share one durable store for the same resource
  (`storage: { type: 'browser-local' }`, or `ActivityTrackerKvStorage` through
  `storage: { type: 'custom' }`). Each writes its own log segment and reads the others' on
  every check, so none loses another's spend.

### Reacting to a refusal

- **`Retry-After` is honoured.** When a service names how long to wait — either as a count of
  seconds or as the moment to resume — the pause lasts at least that long; the calculated
  pause applies only when it is longer. Read it yourself with `parseRetryAfterMs(headerValue)`.
- **`treat_as_back_off`** identifies a refusal that does not announce itself as one. Some
  services reply `403` and explain in the body that the real reason was speed, which is
  indistinguishable from a permission failure without looking:

  ```ts
  treat_as_back_off: async (response) => {
      if( response.status!==403 ) return false;
      const body = await response.json();
      return body?.error?.status==='RESOURCE_EXHAUSTED';
  }
  ```

  It is given a clone, so reading the body here does not consume the caller's copy, and the
  response keeps the status the service actually sent. Return `{minimumMs}` to set a floor.
- **`logBackOff(minimumMs?, clientId?)`** reports a refusal the pacer never saw. A batch call
  spends the cost of many requests at once and comes back a success even when parts inside it
  were rate limited, leaving nothing to pace on. **`getActiveBackOffForMs(clientId?)`** reads
  back how long every request is being held: by a refusal pause, or by a window left over-full
  by a request larger than the whole quota. A request that costs points may wait longer, for
  room in the quota.

### Keeping a retried request valid

`fetch(url, options, ...)` accepts a function for `options`, called afresh for every attempt.
A retry can land minutes after the first try, so anything that goes stale in the meantime —
an access token, an abort signal that has already fired — should be built there rather than
captured up front:

```ts
pacer.fetch(url, async () => ({
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    signal: AbortSignal.timeout(30_000)
}));
```

### Jitter

`back_off_calculation.jitter` varies each calculated pause by up to a fifth **either side** of
its length, so clients that back off together do not return together. Because it runs in both
directions, the average wait across many clients is still the calculated one, and a pause at
`max_single_back_off_ms` still reaches that ceiling. A period the service named itself is never
varied.

### Limits

- Only one quota can be set: `max_points_per_second`, over a sliding one-second window. A limit
  the service sets over a longer period, such as per minute or per day, is not paced against.
- Each pacer sends one request at a time and waits for its answer, so its throughput is bounded
  by the service's response time as well as by the quota.
- Pacers sharing a store do not coordinate their checks. Two can each find room while the
  other's charge is still being stored, and both send; each such coincidence can overshoot the
  quota by at most one request per pacer.
- The configured quota is taken as true. A refusal pauses requests, but never lowers the limit
  the pacer paces against.
- A queued request cannot be withdrawn: when its turn comes it is handled as usual, even if its
  caller no longer wants it. An abort signal in its options makes the send fail, but the
  request is still charged.
- With `storage: { type: 'browser-local' }`, every check against the quota lists the resource's
  keys, which `chrome.storage` does by reading the whole storage area. The more unrelated data
  that area holds, the slower each check.

## Building

- `npm run build_release` Will run the lint (failing if it gives any warnings), build it, and deploy with np
