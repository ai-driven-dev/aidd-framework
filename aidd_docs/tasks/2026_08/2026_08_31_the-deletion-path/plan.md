---
objective: "A person removes what this tool measured about them, after being shown what will go, what will stay, and what history keeps whatever they do."
status: pending
---

# Plan: the deletion path

## Overview

| Field      | Value                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| **Goal**   | Show, confirm, remove, report — and name what no command can reach            |
| **Source** | [`spec.md`](./spec.md); #660's last buildable condition                       |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | What would go, and what cannot                  | [`phase-1.md`](./phase-1.md) |
| 2   | Removing it, and saying what happened           | [`phase-2.md`](./phase-2.md) |
| 3   | A person who asks is answered                   | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision                                                                                     | Why                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A seventh command, `aidd telemetry forget`, rather than a flag on `off`                        | The act is irreversible and `off` is not. Bundling them lets a person reach for the reversible one and lose data. An irreversible act earns its own name, its own help and its own confirmation — which is also what makes it survivable to type by accident.              |
| The command is earned, where three were just deleted for not being                             | Those three were invoked by no skill and answered no stated need. This one is required by a decision of record: #297's privacy clause, reaffirmed, makes removing your own records a right. Phase 3 exists so it does not repeat their other failure — a capability no skill knows about. |
| One resolution of the locations serves both the preview and the removal                        | Two computations that agree today can disagree tomorrow, and the failure mode is deleting something never shown. Making them one value means scope escape cannot be expressed, rather than being tested for and hoped about.                                              |
| History is reported at two strengths, not one                                                  | `listTrackedFiles` answers what is tracked now — the index, not history. <!-- Corrected post-review (2026_08_31): tracked now is NOT certainly in history — a file `git add`ed and never committed is tracked while history holds nothing for it; `hasHistoryFor` (`git log`) is what actually answers whether history holds it. --> Only a commit actually touching it (`hasHistoryFor`) is certainly in history; not tracked now may still be in history and cannot be told apart from never committed. Reporting the weaker case as an all-clear would be the false-certainty fault this branch has paid for five times. |
| The switch is never removed                                                                    | It is configuration, not data, and it is deliberately committed so a fresh clone inherits it. Removing it would change what a repository decided, which is not what a person asking to remove their own records is asking for.                                             |
| No selection by period, project or person                                                      | Choosing a subset is analysis, which the decision record assigns to a destination. This removes what this tool stored, in the places it names.                                                                                                                            |

## Resources

| Source                                                        | Verified                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `telemetry-on-use-case.ts:77`                                 | `listTrackedFiles(projectRoot, RUNS_ENTRY)` — the tracked-journal primitive already exists |
| `telemetry-sink.ts:50`, `person-identity-store.ts:54`         | day-file deletion and identity removal already exist and already report what they did     |
| `aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md` | reaffirms #297's privacy clause; places control local and analysis remote                 |
