---
status: pending
---

# Instruction: attachment

Part of [`plan.md`](./plan.md).

`tasks` gets filled. A session is attached to the work it served, and a session
that served none says so rather than saying nothing.

## Why intervals and not a field

A session that plans task A then implements task B is otherwise attributed
wholesale to one of them, and that is the common case rather than the edge.

```json
"tasks": [
  { "task_id": "2026_08_15_alpha", "from": "...", "to": "..." },
  { "task_id": null,               "from": "...", "to": null  }
]
```

An interval with a null `task_id` is out-of-flow work — the ten-minute debug, the
exploration, the quick question. It is a normal state, not an anomaly, and it is
what makes "61% attached, 39% out of task" sayable instead of measuring two
thirds and calling it a total.

## Tasks to do

### `1)` Read the pointer

1. Read `.aidd/current-task` at `SessionStart` and at every `Stop`.
2. Absent → the interval carries `task_id: null`.
3. Never guess a task from the branch, the cwd, or the most recent task folder.

### `2)` Close and open intervals

1. On `Stop`, set the open interval's `to`.
2. When the pointer's value has changed, open a new interval instead of
   overwriting the old one.

> Two concurrent sessions in one checkout share the pointer, and a background
> agent on another task silently re-points the foreground session. Last-writer-
> wins plus an interval boundary **records** that mis-attribution instead of
> pretending to prevent it — and it needs no mechanism the schema does not
> already have.

### `3)` Ignore `.aidd/`

1. Add the `.gitignore` line. It is today neither tracked nor ignored, and
   `aidd clean` nukes it.

> Ephemeral is the point, not an oversight. The pointer answers "what is being
> worked on right now"; it is written by the planning and implementation skills,
> and a fresh clone legitimately has no answer until one of them runs. A clean
> mid-work costs one interval boundary, and the next skill invocation rewrites it.

### `4)` What this requires of `status`

1. Record in #617 that *no pointer* is not a fault, and must be reported apart
   from *pointer stale* and *hook silent*, which are.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | A session with no pointer produces a record with one interval and `task_id: null`, never no record |
| 1 | A pointer naming a task folder that does not exist is reported, not written as though it were valid |
| 2 | A session whose pointer changes mid-way produces two intervals, never one overwritten value |
| 2 | Two concurrent sessions in the same checkout do not corrupt each other's attachment; each keeps its own file |
| 3 | `git status` is clean after a session, with `.aidd/` present |
| 4 | `status` reports an absent pointer as out-of-flow, not as an error |
