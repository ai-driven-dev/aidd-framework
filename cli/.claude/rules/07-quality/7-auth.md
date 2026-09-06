---
paths:
  - "src/runtime/auth/**/*.ts"
  - "src/contexts/*/application/**/*.ts"
---

# Auth

One GitHub token gates private marketplaces and private plugin sources. There are no accounts,
no roles and no scopes, so the only questions worth a rule are where a token comes from, how it
is stored, and when its absence is allowed to matter.

## Resolution

`AuthReaderAdapter.resolve()` reads, in order: the `AIDD_TOKEN` environment variable, the
project `.aidd/auth.json`, then the user `auth.json` under the config directory. First hit
wins, and the answer is memoized for the process, so `gh` is spawned at most once per
invocation.

A stored config declares `method: "stored"`, the token sitting in the file, or
`method: "external"`, resolved by running `gh auth token` at read time. An `external` config is
resolved at its own level, never as a final fallback after both levels have answered nothing.
There is no third method, and in particular no `"gh"`.

## Storage

A credential file is written `0600` on POSIX and `icacls /inheritance:r` on win32. Failing to
restrict it throws rather than leaving the file readable: a world-readable credential is worse
than no credential, because nobody notices it.

## What is not checked

Nothing refuses a command for lacking a token, and no command validates one up front.
Authorization surfaces at fetch time, as a typed `CatalogFetchAuthError` raised when the
request comes back 401. A local framework path needs no token at all.

So do not add an eager check in a second place: an auth question answered twice is an auth
question answered differently. The full contract, including what `AIDD_TOKEN` does to
`auth status` and how a `gh` spawn fails, is `aidd_docs/memory/auth.md`.
