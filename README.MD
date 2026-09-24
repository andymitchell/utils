# Utils

A collection of small helpful functions. 

## Compatibility

Requires **`zod` `^4`** as a peer dependency (since **v0.28.0**). Projects still on zod 3 must upgrade to zod 4 before using this version.

### Breaking changes in v0.28.0 (Zod 4 migration)

- Peer dependency `zod` moved from `^3.23.8` to `^4.1.8`.
- The `./prettify-zod-v3-error` export is renamed to **`./prettify-zod-error`**; its functions `prettifyZod3Error` / `prettifyZod3ErrorAsArray` / `prettifyZod3ErrorAsJson` are renamed to **`prettifyZodError` / `prettifyZodErrorAsArray` / `prettifyZodErrorAsJson`** and now wrap Zod's native `prettifyError`. Issue **message text** follows Zod 4 defaults (paths are unchanged).

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
- `back_off_calculation: { type: 'exponential', initial_back_off_ms }` sets the pause after the
  first refusal (default 100 ms), doubling with each further refusal until a success.
- Several pacers can share one durable store for the same resource
  (`storage: { type: 'browser-local' }`, or `ActivityTrackerKvStorage` through
  `storage: { type: 'custom' }`). Each writes its own log segment and reads the others' on
  every check, so none loses another's spend. On `chrome.storage` a check reads the whole
  storage area.

> Previously a success paused every request until all spend of the last 30 s had drained, and
> other pacers sharing the store saw that pause as a refusal. Now a request within quota is
> never answered with a synthetic 429, `back_off_for_ms` on a synthetic 429 is when that request
> fits, and `getActiveBackOffForMs()` reports refusal pauses (plus a window over-full after an
> oversized request) only. `ActivityTrackerKvStorage` no longer takes
> `failsafe_active_sync_poll_ms`: every check reads the store afresh.

### Reacting to a refusal

- **`Retry-After` is honoured.** When a service names how long to wait — either as a count of
  seconds or as the moment to resume — that period is used instead of the calculated guess,
  which can only be shorter. Read it yourself with `parseRetryAfterMs(headerValue)`.
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
  back how long requests are currently being held.

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

> Previously jitter only ever lengthened a pause, and inverted to shorten it once the pause
> reached `max_single_back_off_ms` — so a run at the ceiling could wait up to 40% less than
> configured. Anything relying on those exact timings will now see different ones.

## Building

- `npm run build_release` Will run the lint (failing if it gives any warnings), build it, and deploy with np

