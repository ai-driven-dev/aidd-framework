---
objective: "The behaviour a user types is pinned by a test that names it, not left to a mutant nobody generated."
status: in-progress
---

# Plan: Cover what no test executes

## Overview

| Field | Value |
| ----- | ----- |
| **Goal** | Turn the measured no-coverage set into tests that pin user-visible behaviour, and refuse the ones that would only move a number |
| **Source** | `reports/mutation/<scope>/mutation.json`, produced by `pnpm test:mutation:<scope>` — the seven committed scopes of `2026_09_03_mutation-scopes` |

## What the measurement says

2 582 mutants across 134 files sit in code no unit or integration test executes. That is not
one problem. Ranked, it is three:

| Where | Mutants | Share of the file | What it is |
| ----- | ------: | ----------------: | ---------- |
| `presentation/commands/*` | ~980 | 100 % | commander wiring: `.command()`, `.option()`, `.action()` |
| `presentation/display/*` | 130 | 100 % | pure formatting functions |
| everything else | ~1 470 | 27–92 % | parsing, transforms, orchestration, adapters |

## The decision that shapes this plan

**The command files are not covered here, and the score stays low on purpose.** Their branch
is commander's, not ours; a unit test over them asserts that `.option()` was called, which is
mechanism. The repo's own test skill forbids the shape it would take — "snapshot tests on menu
trees / output strings" — and what actually proves them is the e2e suite and the smoke script,
which the mutation run cannot see. `presentation` scoring 14,08 % is a known artifact of the
measurement's blind spot, recorded as such, not a debt.

Everything else is covered where a regression would be visible to someone using the CLI.

## Phases

| # | Phase | Mutants | File |
| - | ----- | ------: | ---- |
| 1 | The source spellings a user types | 71 | [`phase-1.md`](./phase-1.md) |
| 2 | Copilot's content transforms | 173 | to write after phase 1 is measured |
| 3 | The marketplace sync flow | 100 | idem |
| 4 | What the displays print | 130 | idem |
| 5 | Three adapters, at the integration tier | 105 | idem |

Only phase 1 is written. The rest are named so the shape is visible, and will be written once
phase 1 has been re-measured — planning five phases of test-writing before knowing what one
moves is how a plan becomes a wish.

## Decisions

| Decision | Why |
| -------- | --- |
| A test is written only when the regression it prevents can be named | A test written to kill a mutant raises the score and protects nothing. Each phase states what breaks for a user if the behaviour regresses; if that cannot be stated, the test is not written |
| Named by intention, with the functional case inside | `describe` names the thing the user does — the spelling, the flow — and the nested `it` names the observable outcome. Never the function called. The repo's `aidd-dev` test skill already says this in `02-name-behaviorally`; this plan only refuses to drift from it |
| Extend the existing test file, do not open a new one | `kernel/source.unit.test.ts` already has the nested shape. A second file for the same unit splits the story of one behaviour across two places |
| Re-measure after each phase, and quote the delta as approximate | Run-to-run noise on a scope is around 0,4 point. A delta quoted to the hundredth claims a precision the instrument does not have |
| The score is never the acceptance criterion | Stated in the project goal: scored, never gating. A phase is done when the named behaviours are pinned, and the score is reported as what it is — a consequence |
