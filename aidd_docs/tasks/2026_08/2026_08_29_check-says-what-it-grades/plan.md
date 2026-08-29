---
objective: "`aidd telemetry check` states what is in place before grading whether anything recorded, and reports a chain that has not run yet as not-yet rather than broken."
status: in-progress
---

# Plan: the diagnostic says what it is grading

## Overview

| Field      | Value                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| **Goal**   | State what is in place; stop calling "not yet" broken; add no command          |
| **Source** | [`spec.md`](./spec.md); the challenge at `../2026_08_28_telemetry-challenge.md` |

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | What is in place, before any verdict          | [`phase-1.md`](./phase-1.md) |
| 2   | "Not yet" stops being a failure               | [`phase-2.md`](./phase-2.md) |
| 3   | The consumers of the shape follow it          | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision                                                                                  | Why                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `aidd telemetry status`; the existing command gains a first half                         | The gap is not a missing surface — it is that `check` grades without saying what it grades. A seventh command would have to clear the bar three commands were just deleted for failing.                                                                                          |
| A declaration is stated as a declaration, never as proof the recorder will fire              | `claude-cli-adapter.ts` records the measured case: a declared `enabledPlugins` entry is silently dropped as orphaned when a headless run never registers the plugin. Promising "installed, so it will fire" would be a false justification of exactly the kind this branch has already paid for twice. |
| The stated half carries no count of what is stored                                          | A count is a figure, and the report owns figures. A diagnostic that starts reporting quantities becomes a second report that can disagree with the first.                                                                                                                       |
| The claim set and its order are untouched                                                   | Four claims, always in that order, is a contract a skill relays verbatim. This change alters what one of them *concludes*, not how many there are.                                                                                                                             |

## Resources

| Source                                                | Verified                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `cli/dist/cli.js telemetry check`, project just on    | prints `hook fired FAIL — the hook has never been observed firing` on a healthy new project     |
| `cli/src/infrastructure/adapters/claude-cli-adapter.ts:5-13` | a declared plugin entry is dropped as orphaned in a headless run — why a declaration is not proof |
| `cli/src/domain/ports/telemetry-evidence-reader.ts`   | the port that already serves `check` and `off`, and the one this extends                       |
