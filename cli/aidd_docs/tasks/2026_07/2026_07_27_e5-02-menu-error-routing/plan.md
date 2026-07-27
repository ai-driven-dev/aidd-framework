---
objective: "A failure inside the interactive menu prints an actionable message and exits, instead of being silently swallowed into an infinite loop."
status: implemented
---

# Plan: SPIKE-E5-01 + BUG-E5-02 — menu.ts error routing

## Overview

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| **Goal**   | `menu.ts` surfaces non-abort errors through `ErrorHandler` like every other command, instead of discarding them. |
| **Source** | `epic-E5-command-layer-safety.md` (SPIKE-E5-01, BUG-E5-02 — cartography item A9) |

## Phases

| #   | Phase                       | File                          |
| --- | ----------------------------- | ------------------------------ |
| 1   | Route menu errors + cover it  | [`phase-1.md`](./phase-1.md) |

## Spike findings (SPIKE-E5-01) — confirmed, and worse than the ticket framed it

`src/application/commands/menu.ts:40-42`, current code:

```ts
} catch (error) {
  if (error instanceof Error && error.name === "ExitPromptError") process.exit(0);
}
```

The ticket described this as "menu.ts never calls `ErrorHandler.handle`" — true, but understates the impact. The `catch` has **no else branch**: any error that is not an `ExitPromptError` is caught and discarded, then the enclosing `for (;;)` immediately re-runs the same code.

**Consequences, both real:**
1. **Violates the project's own error rule** (`.claude/rules/00-architecture/0-error-handling.md`: *"No silent errors, every failure surfaces to the user"*). Every other command routes through `errorHandler.handle(error)` — `ai.ts` alone does so 7 times.
2. **Infinite silent spin.** A deterministic failure in `InteractiveMenuUseCase.execute()` (corrupt manifest, unreadable project root) throws on every iteration, is swallowed every time, and the loop never terminates — with zero output. The user sees a hung terminal, not an error.

Three throw sources reach this `catch`: the menu prompt (`InteractiveMenuUseCase.execute()`), `spawnCliCommand()`, and `waitForEnter()`. All are menu *infrastructure* failures — sub-command failures do not surface here, because `spawnCliCommand` runs them as subprocesses and returns an exit code rather than throwing.

## Decisions

| Decision | Why |
| -------- | --- |
| Route non-abort errors to `ErrorHandler.handle()` — which prints to stderr and exits 1 — rather than printing and continuing the loop | The three throw sources are all menu infrastructure, not user command failures. If the menu itself cannot run, continuing the loop just reproduces the same failure; exiting with a clear message is the honest outcome and matches every other command. `handle()` returns `never`, so it also satisfies `runMenuLoop`'s `Promise<never>` signature without a cast. |
| Extract the decision into an exported `routeMenuError(error, errorHandler)` instead of fixing it inline | `runMenuLoop` builds its own deps (`createMenuDeps(resolveProjectRoot())`) and calls `process.exit`, so it has no unit test today and cannot get one without being made injectable — scope beyond this ticket. A small exported seam lets the *actual fixed behavior* ("a non-abort error reaches the handler rather than being discarded") be asserted directly, honoring the backlog's rule that every BUG lands with regression coverage. |
