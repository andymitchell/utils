# Utils

A collection of small helpful functions. 

## Compatibility

Requires **`zod` `^4`** as a peer dependency (since **v0.28.0**). Projects still on zod 3 must upgrade to zod 4 before using this version.

### Breaking changes in v0.28.0 (Zod 4 migration)

- Peer dependency `zod` moved from `^3.23.8` to `^4.1.8`.
- The `./prettify-zod-v3-error` export is renamed to **`./prettify-zod-error`**; its functions `prettifyZod3Error` / `prettifyZod3ErrorAsArray` / `prettifyZod3ErrorAsJson` are renamed to **`prettifyZodError` / `prettifyZodErrorAsArray` / `prettifyZodErrorAsJson`** and now wrap Zod's native `prettifyError`. Issue **message text** follows Zod 4 defaults (paths are unchanged).

## Building

- `npm run build_release` Will run the lint (failing if it gives any warnings), build it, and deploy with np

