# Auth

How identity and access work. No user accounts: one GitHub token gates private marketplaces and plugin sources.

## Authentication

- Commands: `aidd auth login | logout | status` (`src/presentation/commands/auth.ts`).
- Method per stored config: `stored` (a token in `auth.json`) or `external` (resolved from `gh auth token` at read time). There is no `gh` method.
- Resolution order (`src/runtime/auth/auth-reader-adapter.ts`), first hit wins: `AIDD_TOKEN`, project `.aidd/auth.json`, user config `auth.json`, else none. An `external` config is resolved at its own level, not as a final fallback.
- Storage (`src/runtime/auth/auth-storage.ts`): project `<root>/.aidd/auth.json`, user under the config dir, which `AIDD_USER_CONFIG_DIR` moves — that is how the suites stay out of a real profile.
- Shape: `{ version: 1, createdAt, method, token?, provider?, level }`. A file missing `version` or `createdAt` reads as null, so a hand-written one authenticates nobody.
- The file is written `0600` on POSIX, `icacls /inheritance:r` on win32. Failing to restrict throws rather than leaving a world-readable credential.

## Authorization

- No roles, no scopes. A token is not checked up front: nothing refuses a command for lacking one.
- It surfaces at fetch time as `CatalogFetchAuthError` when the request 401s.

## Sessions

- No sessions, no refresh. A `stored` token lives until `auth logout`.
- `resolve()` memoizes per process, and the graph is built once per project root, so `gh` is spawned at most once per invocation.
- The `gh` spawn fails two ways: absent from `PATH` answers null and degrades silently; a non-zero exit or a 3s timeout throws and aborts the command.
- `AIDD_TOKEN` short-circuits the active-config read too, synthesising `method: "stored"`, `level: "user"` — so `auth status` reports stored user auth with nothing on disk.
