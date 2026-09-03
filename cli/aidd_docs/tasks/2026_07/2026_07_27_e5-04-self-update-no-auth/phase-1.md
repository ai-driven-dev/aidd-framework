---
status: done
---

# Instruction: Drop the auth gate from self-update

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/application/commands/self-update.ts              ✏️ modify (remove auth gate)
    ├── tests/infrastructure/adapters/
    │   └── self-updater-adapter.integration.test.ts         ✏️ modify (unauthenticated-user guard)
    └── tests/e2e/
        └── command-matrix-help.e2e.test.ts                  ✏️ modify (asserted the old gate)
```

## Tasks to do

### `1)` Remove the gate

1. Delete `await deps.requireAuthUseCase.execute();` from `self-update.ts`.
2. Leave everything else untouched — the `try`/`catch` + `errorHandler.handle` wrapper and all four result branches stay exactly as they are.
3. Check whether `deps.requireAuthUseCase` is still consumed elsewhere. **It is not** — self-update was its only caller in `src/`. Left wired anyway; see plan.md Decisions for why (documented architectural fixture, `knip:production` clean).

### `2)` Cover it

1. Cover it where the claim actually lives. `SelfUpdateUseCase` never touched auth — the gate was in the command — so a use-case test would prove nothing. The substantive claim is that the *adapter* resolves a version with no token.
2. Add a case to `tests/infrastructure/adapters/self-updater-adapter.integration.test.ts`: construct `SelfUpdaterAdapter` with a `tokenProvider` resolving `null`, assert `fetchLatestRelease()` still returns the version and still hits the npm dist-tags URL.
3. This fails first if any self-update path ever becomes token-dependent again, before a user is locked out.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `aidd self-update --check` on a machine with no aidd credentials reports whether a newer version exists, instead of failing with "not authenticated". |
| 1    | `aidd self-update` (real install) likewise proceeds without credentials — the npm shell-out never used them. |
| 1    | `grep -n "requireAuthUseCase" src/application/commands/self-update.ts` returns nothing. |
| 2    | The adapter resolves a version with a `tokenProvider` yielding `null`. |
| all  | `tsc --noEmit` clean, `pnpm test` (build + vitest) green. |

## Correction found during implementation

The plan claimed no existing test asserted the auth gate. **That was wrong.** `tests/e2e/command-matrix-help.e2e.test.ts:262` asserted exactly it: *"self-update --check exits 1 when not authenticated (requires auth)"*.

Two reasons the pre-removal check missed it: the grep looked for `requireAuth`/`NotAuthenticated`, but the test names the behaviour in prose (*"not authenticated"*); and `npx vitest run` alone passed, because e2e specs execute the **built** binary — which was stale, still containing the gate. Only `pnpm test` (`pnpm build && vitest run`, what the pre-push hook runs) surfaced it.

The e2e now asserts the fixed behaviour, checking the *absence* of the auth failure rather than exit 0 — `--check` performs a real npm lookup, so the exit code depends on network reachability while "not authenticated" must never appear either way.
