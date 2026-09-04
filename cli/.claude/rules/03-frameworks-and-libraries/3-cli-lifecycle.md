---
paths:
  - "src/cli.ts"
  - "src/presentation/commands/**/*.ts"
---

# CLI Process Lifecycle

## Background work

- A short-lived CLI process exits as soon as its action resolves
- Never fire-and-forget background I/O with in-process `unref()` / detached promise — the process exits before the fetch settles, the side-effect never runs, the feature is silently dead
- Allowed patterns for deferred network work:
  - Piggyback: run it inside a command that is already paying for network I/O, awaited
  - Bounded await: `await` it with a hard timeout on the hot path
  - Detached child: spawn a separate process that outlives the parent
- Hot path stays read-only and offline — read cache, print, return; never block startup on the network

## Validating side-effects

- A unit test that `await`s a mocked fetch erases the real exit-before-settle race — it proves the function, not the feature
- For any feature whose value is an observable side-effect (file written, cache refreshed, request sent), assert it on the **real built binary** (`03-assert`), not only in unit tests
- Green gates (typecheck, unit, coverage) do not prove a lifecycle-dependent feature actually fires
