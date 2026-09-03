---
objective: "aidd self-update works without being logged in, in every mode — because nothing it does requires authentication."
status: implemented
---

# Plan: SPIKE-E5-03 + BUG-E5-04 — self-update requires no auth

## Overview

| Field      | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| **Goal**   | Remove the unconditional auth gate from `self-update`, which blocks an operation that never needed a token. |
| **Source** | `epic-E5-command-layer-safety.md` (SPIKE-E5-03, BUG-E5-04 — cartography item A10) |

## Phases

| #   | Phase                    | File                          |
| --- | -------------------------- | ------------------------------ |
| 1   | Drop the auth gate         | [`phase-1.md`](./phase-1.md) |

## Spike findings (SPIKE-E5-03) — confirmed, and broader than the ticket

`self-update.ts:20` calls `await deps.requireAuthUseCase.execute()` unconditionally, before `selfUpdateUseCase.execute()`. `RequireAuthUseCase` throws `NotAuthenticatedError` when no token resolves — so an unauthenticated user cannot even ask *"is there a newer version?"*.

The ticket assumed only `--check`/`--dry-run` were wrongly gated. Tracing every path through `SelfUpdaterAdapter` shows **no mode needs auth at all**:

| Path | Auth requirement |
| ---- | ---------------- |
| `resolveLatestVersion()` — the version lookup behind every mode | Hits the **npm registry**, no token. Deliberate, with a standing in-code comment: *"Version comes from npm — the registry `npm install -g` actually pulls from, reachable without a token whether the GitHub repo is public or private."* |
| `fetchChangelog()` | Token is **optional**: `(await this.tokenProvider?.resolve()) ?? undefined`. On any failure it logs at debug level and returns `null` — designed to degrade, not to fail. |
| `install()` | `execSync("npm install -g …")`. A shell out to the package manager; the aidd token is never involved. |

So the gate blocks all four outcomes (`check-available`, `check-current`, `dry-run`, `updated`) on a credential none of them consume.

## Decisions

| Decision | Why |
| -------- | --- |
| Remove the auth call entirely rather than skipping it only for `--check`/`--dry-run` | User-confirmed after the spike evidence was presented. Gating only the install path would encode a condition the code proves unnecessary — `install()` is `execSync("npm install -g")` and consumes no aidd token either. A conditional guarding nothing is worse than no conditional. |
| Treat this as a bug fix, not a policy change | The spike found no mechanism by which the token affects any self-update outcome, so removing it changes no security boundary — it only stops rejecting users the operation never depended on. If a *product* decision to restrict updates to authenticated users is wanted later, it needs a real mechanism (licence check, private registry), not a gate in front of a public npm fetch. |
| **Leave `requireAuthUseCase` wired in `deps.ts` even though it now has zero consumers** — flagged, not removed | Consequence discovered after the removal: `self-update.ts` was its *only* caller in `src/`, so `RequireAuthUseCase` is now unconsumed production wiring. Not deleted here for three reasons: it is a documented architectural fixture (`aidd_docs/memory/auth.md`: *"RequireAuthUseCase — single source of auth validation. Never duplicate auth checks across commands or use-cases"*), an `auth.ts` command exists that future auth-requiring work would route through it, and the project's own dead-code gate (`pnpm knip:production`) passes clean. Deleting an auth primitive as a side effect of a self-update bug fix is the wrong blast radius — surfaced for a separate decision instead. |
