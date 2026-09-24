# Changelog

Notable changes to `@andymitchell/utils`, newest first, in the style of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases before 0.33.0 list only
selected changes.

## Unreleased

### Changed

- `fetch-pacer`: the quota is a sliding one-second window, checked just before each request is
  sent. A request waits only until enough earlier spend has left the window for it to fit; one
  larger than the whole quota goes once the window is empty. Previously every success paused
  all requests until the spend of the last 30 seconds had drained.
- `fetch-pacer`: a request's points are charged the moment it is sent, and kept when the service
  refuses it or the request fails, since the service may have metered it either way. Other
  pacers sharing the store count it while it is still in flight.
- `fetch-pacer`: a request within quota is never answered with a synthetic 429, and
  `back_off_for_ms` on a synthetic 429 is when that request would fit.
- `fetch-pacer`: `getActiveBackOffForMs()` reports only a refusal pause, or a window left
  over-full by a request larger than the whole quota. Spending no longer shows up there, nor as
  a refusal to other pacers sharing the store.
- `fetch-pacer`: `minimum_time_between_fetch` is measured from the previous send, so the first
  request goes at once and time spent waiting for quota or out a refusal counts towards the gap.
  It was previously slept in full before every request.
- `fetch-pacer`: `ActivityTrackerKvStorage` gives each writer its own log segments and reads the
  store afresh on every check, so pacers sharing a store never overwrite each other's history.
  A failure to clear expired segments is logged with `console.debug` and does not fail the
  request.
- `fetch-pacer` (**breaking** for custom trackers): `ActivityItem` has a third variant,
  `{ type: 'reserved', timestamp, points }`, for the charge made as a request is sent. An
  `IActivityTracker` passed through `storage: { type: 'custom' }` must store and list it like
  any other entry.
- `fetch-pacer`: for subclasses of `FetchPacer`, the tracker behind the protected `paceTracker`
  reads the refusal pause with `getRefusalPauseUntilTs()` (formerly `getActiveBackOffUntilTs()`)
  and how long a request would wait with `getPauseBeforeMs(points)`. It has no
  `getActiveBackOffForMs()`.
- `fetch-pacer`: `FetchPacerMultiClient.fetch` is typed to return
  `Promise<PaceResponse | BackOffResponse>`, as `FetchPacer.fetch` is.

### Added

- `fetch-pacer`: `back_off_calculation.initial_back_off_ms` sets the pause after the first
  refusal in a run. It defaults to 100 ms, the length previously fixed.
- `fetch-pacer`: the types `PaceTrackerOptions`, `FetchPacerOnlyOptions`, `BackingOffEvent`,
  `FetchPacerEvents`, `ActivityTrackerOptions`, `ActivityTrackerKvStorageOptions`,
  `ActivityItem`, `StoredActivityItem` and `SetBackOffUntilTsOptions` are exported.
- `kv-storage-types`: exports `KvRawStorageEventMap`, the events a store announces.

### Fixed

- `fetch-pacer`: a refusal always earns its pause, even when another pacer sharing the store
  records a success in the same millisecond. It previously earned no pause at all (and in
  `attempt_recovery` mode reached the caller without a retry), or only the fixed 200 ms when
  the service named a wait. A success recorded in the same millisecond as a refusal no longer
  ends that refusal's run, which can make the pause one doubling longer than it needed to be.

### Removed

- `fetch-pacer`: the `failsafe_active_sync_poll_ms` option of `ActivityTrackerKvStorage`, since
  every check reads the store afresh.
- `fetch-pacer`: the protected `activities` and `active` fields that subclasses of
  `ActivityTrackerKvStorage` could reach.

## 0.33.0 - 2026-09-23

### Changed

- **Breaking:** the package is renamed from `@andyrmitchell/utils` to `@andymitchell/utils`, and
  published to GitHub Packages (`https://npm.pkg.github.com`) instead of the public npm
  registry. Versions up to 0.32.1 stay on npm under the old name. `BUILD.MD` in the repository
  explains how to install from GitHub Packages.

## 0.32.0 - 2026-08-13

### Added

- `fetch-pacer`: a `Retry-After` header on a refusal is followed, and `parseRetryAfterMs` reads
  one.
- `fetch-pacer`: `treat_as_back_off` identifies a refusal sent with a status other than 429.
- `fetch-pacer`: `logBackOff()` and `getActiveBackOffForMs()` on `FetchPacer` and
  `FetchPacerMultiClient`, to report a refusal the pacer never saw and to read back how long
  requests are held.
- `fetch-pacer`: `fetch()` accepts a function for its options, called afresh for every attempt.

### Changed

- `fetch-pacer`: `back_off_calculation.jitter` varies each calculated pause by up to a fifth
  either side of its length. It previously only lengthened a pause, and inverted to shorten it
  once the pause reached `max_single_back_off_ms`, so a run at the ceiling could wait up to 40%
  less than configured. Anything relying on those exact timings sees different ones.
- `fetch-pacer`: `back_off_for_ms`, `cannot_recover` and `back_off_accumulated_ms` are on
  `PaceResponse`, since a refusal is not always a 429.

## 0.28.0 - 2026-06-02

### Changed

- **Breaking:** the peer dependency `zod` moves from `^3.23.8` to `^4.1.8`.
- **Breaking:** the `./prettify-zod-v3-error` export is renamed `./prettify-zod-error`, and its
  functions `prettifyZod3Error`, `prettifyZod3ErrorAsArray` and `prettifyZod3ErrorAsJson` are
  renamed `prettifyZodError`, `prettifyZodErrorAsArray` and `prettifyZodErrorAsJson`. They wrap
  Zod's native `prettifyError`, so issue message text follows Zod 4's defaults; paths are
  unchanged.
