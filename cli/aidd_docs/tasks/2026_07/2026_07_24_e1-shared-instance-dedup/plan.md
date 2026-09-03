---
objective: "StatusAllUseCase, RestoreAllUseCase, and UpdateAllUseCase receive the already-wired StatusUseCase/RestoreUseCase/UpdateOneToolUseCase from deps.ts by injection, instead of each rebuilding its own duplicate instance."
status: implemented
---

# Plan: SPIKE-E1-01 + BUG-E1-02 — one instance per shared collaborator

## Overview

| Field      | Value                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Remove the 4 sites where a global "All" use-case reconstructs its own copy of a collaborator deps.ts already built and shares with ai.ts/ide.ts commands. |
| **Source** | `aidd_docs/tasks/2026_07/2026_07_22_aidd-tool-contract-cartography/epic-E1-dependency-graph-hygiene.md` (SPIKE-E1-01, BUG-E1-02) |

## Phases

| #   | Phase                                              | File                          |
| --- | ----------------------------------------------------- | ------------------------------ |
| 1   | Inject shared instances, drop the 4 duplicate sites   | [`phase-1.md`](./phase-1.md) |

## Resources

None external — pure internal codebase tracing.

## Decisions

| Decision | Why |
| -------- | --- |
| Spike folded into this plan instead of a separate phase | Findings are small and mechanical (4 confirmed sites, no excluded site, all 3 target classes independently confirmed stateless by reading their full source — no memo maps, no accumulator fields, only `private readonly` constructor deps). Same precedent as BUG-E2-01. Recorded below in full per the ticket's DoD, which requires this to be attached to the fix. |
| Corrected citation vs the ticket | The ticket's Gherkin cites `restore-all-use-case.ts:77/101-112` as one range. Re-reading the current file found **two separate** duplicate-construction sites inside it (`promptForFiles` and `runConfigRestore`), not one — both fixed here. |
| Drop now-dead constructor params, not just add the shared instance alongside them | Each duplicate-construction site was the *only* consumer of several of its class's raw sub-dependency params (verified per class, see spike findings below). Keeping them as unused params after injection would violate the project's dead-code rule. Removing them is not scope creep — it's the direct, unavoidable consequence of injecting the real instance instead of its ingredients. |

## Spike findings (SPIKE-E1-01)

**Confirmed duplicate-construction sites (file:line, current code, re-verified — not trusted from the ticket):**

1. `src/application/use-cases/global/status-all-use-case.ts:25` — `StatusAllUseCase.execute()` builds `new StatusUseCase(this.fs, this.manifestRepo, this.hasher)` on every call. `deps.ts:592` already builds `statusUseCase` with the identical args and exposes it as `deps.statusUseCase`, consumed directly by `ai.ts:124` and `ide.ts:118`.
2. `src/application/use-cases/global/restore-all-use-case.ts` (`promptForFiles`) — builds `new StatusUseCase(this.fs, this.manifestRepo, this.hasher)` on every call. Same duplicate as site 1, inside a different class.
3. `src/application/use-cases/global/restore-all-use-case.ts` (`runConfigRestore`) — builds `new RestoreUseCase(...)` (10 args) on every call. `deps.ts:608` already builds `restoreUseCase` with the identical args and exposes it as `deps.restoreUseCase`, consumed directly by `ai.ts:209` and `ide.ts:199`.
4. `src/application/use-cases/global/update-all-use-case.ts` (constructor body) — builds `this.updateOneToolUseCase = new UpdateOneToolUseCase(...)` (5 args) once per `UpdateAllUseCase` instance. `deps.ts:635` already builds `updateOneToolUseCase` with the identical args and shares it with `updateAiToolsUseCase`/`updateIdeToolsUseCase` (`deps.ts:653-661`).

**No site excluded from scope** — all 4 have a directly matching shared instance already in `deps.ts` with identical construction args; none has a legitimate reason to diverge.

**Statelessness (read in full, not assumed):**
- `StatusUseCase` (`status-use-case.ts`) — only `private readonly` constructor fields (`fs`, `manifestRepo`, `hasher`). No mutable field. Stateless.
- `RestoreUseCase` (`restore-use-case.ts`) — only `private readonly` constructor fields. Every `execute()` call builds its own local `RestoreCtx`; nothing persists across calls. Stateless.
- `UpdateOneToolUseCase` (`update-one-tool-use-case.ts`) — only `private readonly` constructor fields. `BulkConflictState` (the one piece of cross-call-shaped state in this area) is passed as an `execute()` *parameter* by the caller (`UpdateAllUseCase.execute()` creates a fresh one per invocation) — never stored on `this`. Stateless.

All 3 confirmed safe to share as singletons across concurrent/sequential command invocations.
