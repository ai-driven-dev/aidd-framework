---
description: Apply when a token is read, stored or checked; one GitHub token, resolved once, never checked eagerly.
paths:
  - "src/runtime/auth/**/*.ts"
  - "src/contexts/*/application/**/*.ts"
---

# Auth

## Resolution

- `AuthReaderAdapter.resolve()`: `AIDD_TOKEN`, project `.aidd/auth.json`, user `auth.json`.
- First hit wins; memoized, so `gh` spawns at most once.
- `method: "stored"` holds the token.
- `method: "external"` runs `gh auth token` at read time, at its own level.
- No `"gh"` method exists.

## Storage

- Write a credential `0600` on POSIX, `icacls /inheritance:r` on win32.
- Throw when the restriction fails.

## Not checked

- No command refuses for a missing token.
- Authorization surfaces as `CatalogFetchAuthError` on a 401.
- A local framework path needs no token.
- Full contract: `aidd_docs/memory/auth.md`.
