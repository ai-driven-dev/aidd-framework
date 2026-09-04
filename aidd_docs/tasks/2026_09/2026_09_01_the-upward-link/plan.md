---
objective: "A task folder names the backlog item it delivers, and a period breaks down by it, reconciling with every other breakdown."
status: pending
---

# Plan: the upward link

## Overview

| Field      | Value                                                                |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | From "this task cost X" to "this backlog item cost X"                   |
| **Source** | [`spec.md`](./spec.md); the irreducible half of #649                   |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | A folder says what it delivers                  | [`phase-1.md`](./phase-1.md) |
| 2   | A period breaks down by it                      | [`phase-2.md`](./phase-2.md) |
| 3   | The skills that open a folder write it          | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision                                                                                | Why                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #649 is rescoped to the upward link alone, and the rest is recorded as already delivered | Its `steps[]` of `{skill, from, to, produced}` duplicates what the journal writes as timestamped lines — `step_start { at, skill }` and `file_written { at, path, source }` — from which the pairing is derivable by the interval mechanism already in use. A second copy that can disagree is worse than none, which is the reasoning #649 itself applies to tokens and cost. |
| One file at the folder's own level, not frontmatter on an artefact                       | The link belongs to the folder, and a folder may hold a spec with no plan or a plan with no spec. Putting it on one artefact makes the folder's identity depend on which artefact happens to exist, and lets two artefacts disagree — which the framework's own rule forbids: keep one authority.                     |
| One field for both supports, never two                                                   | `persistence.md:13` prescribes exactly this: a native reference where one is supported, a stable id, URL or project-relative path otherwise. Two fields would invite both being set and disagreeing.                                                        |
| The declaration carries when it was written and by what                                  | A wrong link is worse than none, and the only way to judge one is to know which act produced it. This is provenance, not status.                                                                                                                            |
| The read path never writes into a task folder                                             | Reading what work cost must not modify the work. It is also what lets a report be run on a checkout someone else owns.                                                                                                                                       |
| No new command                                                                            | Declaring belongs to the skills that already create the folder; reading belongs to the report that already exists. Three commands were deleted on this branch for not being earned, and this one would not be either.                                        |

## Resources

| Source                                                       | Verified                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `plugins/aidd-telemetry/hooks/lib/record.cjs:169,177`        | the journal writes `file_written { at, path, source }` and `step_start { at, skill }`             |
| `plugins/aidd-pm/skills/10-task/references/persistence.md:13`| "Use native fields when supported; otherwise use stable ids, URLs, or project-relative paths. Keep one authority across supports." |
| `git ls-files \| grep -c metadata.json`                      | 0 — nothing declares a backlog item today                                                         |
| `aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md` | the boundary this sits inside: exposing locally, not aggregating across repositories               |
