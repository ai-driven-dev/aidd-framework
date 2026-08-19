---
objective: "The hook records facts, one per line, appended. Everything else is derived at read time."
status: pending
type: plan
---

# Plan: the run journal becomes an event log

## Overview

| Field | Value |
| --- | --- |
| **Goal** | Nothing the hook writes is ever rewritten, and nothing it writes is an interpretation |
| **Specification** | `ai-driven-dev/framework#620`, whose record shape this replaces |
| **Unblocks** | #663 becomes one more line type, #647 and #629 read a stable format |
| **Cost of waiting** | Zero run files exist anywhere. Every later day makes this a migration |

## Why the current shape is wrong

The record is a mutable state machine. `tasks[]` is an interpretation, `ended_at` is a
derived value rewritten on every turn, and `to: null` is an interpretation the reader has
to guess. Seven measured failure cases trace to one habit: **the hook writes conclusions
instead of observations.**

A conclusion frozen at write time cannot be revised. The clearest example: the first task
a session touches absorbs everything that preceded it, because the interval keeps the
session's own start. Twenty minutes of unrelated work land on that task, permanently, and
the out-of-flow figure — the one worth having — reads zero.

## What replaces it

One file per session, one JSON object per line, appended and never rewritten.

```
aidd_docs/runs/<run_id>__<vendor_id>.jsonl
```

A JSON object is a closed block: adding to it means reading, parsing, re-serialising and
rewriting the whole file. Two hundred facts is two hundred rewrites, and a process that
dies during one leaves a truncated file — losing the header along with the facts. An
appended line costs one write and can lose at most itself.

## The lines

Every line carries `at` (ISO 8601, UTC) and `type`. Nothing else is mandatory.

| `type` | Carries | Fired by |
| --- | --- | --- |
| `session_start` | `schema_version`, `run_id`, `project_id`, `project_remote`, `tool`, `vendor_id`, `vendor_field` | SessionStart |
| `turn_end` | `prompt_id` when the host provides one | Stop |
| `file_written` | `path`, repository-relative | PostToolUse |

`project_remote` is new: `project_id` is derived from it, and keeping the source means a
changed remote can be re-derived rather than silently splitting a project in two.

**`file_written` records the path, never a `task_id`.** The task is a derivation from the
path, so it belongs to the reader — which is also what lets a renamed task folder be
repaired by a mapping instead of splitting its history.

## What leaves the record

| Field | Why |
| --- | --- |
| `ended_at` | It is what forces a rewrite every turn. It is the timestamp of the last line |
| `tasks[]` | It is the interpretation itself |
| `parent_run_id` | **Measured**: a subagent shares its parent's `session_id`. Nesting happens inside a run, not between runs, so the field modelled something that does not exist |

## Phases

| # | Phase | Ends when |
| --- | --- | --- |
| 1 | [The written form](./phase-1.md) | the hook appends lines and never rewrites a file |
| 2 | [The tests](./phase-2.md) | the suite asserts facts per line type, and no test asserts a shape that no longer exists |
| 3 | [The documents](./phase-3.md) | every place describing the old record describes the new one |

## Standing rules

- **Append only.** No code path may read a run file in order to write it again.
- **No derivation is stored.** If a value can be computed from another recorded value, it
  is not written. The single exception is `project_id`, kept beside its own source.
- **Exit 0 always.** Unchanged from #620: a measurement that breaks a session is worse
  than one that misses a session.
- **Zero dependencies.** The hook is copied verbatim into user projects; it may require
  nothing outside `node:`.
- **`schema_version` moves to 2**, on the `session_start` line. This is what it was for.

## Out of scope

Recording skills and subagents is #663. This plan makes them one more line type and
stops there. The reader that turns lines into per-task figures is #629.
