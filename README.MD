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

