---
status: done
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

## Attachment is observed, never declared

This phase first read a pointer file, `.aidd/current-task`, written by the
planning and implementation skills. **That design is gone**, and both reasons are
worth keeping, because either one alone would have been enough:

- It put a measurement concern inside code-transformation skills, which
  `docs/ARCHITECTURE.md` forbids — every capability lives in exactly one plugin,
  chosen by concern.
- It hardcoded `$CLAUDE_CODE_SESSION_ID` into skill content that
  `aidd framework build` ships to **five** tools. And that variable leaks: a
  Codex session launched from inside a Claude Code session inherits it from its
  parent, measured. The pointer would have been written under the wrong session.

What replaced it needs no declaration at all: **a write landing inside a task is
what says the session is working on it.** The hook watches file writes; the path
is the evidence.

This also dissolved a problem rather than solving it. Two concurrent sessions in
one checkout used to share one pointer and silently re-point each other, and the
answer was to record the mis-attribution honestly. Now each session sees only its
own writes, so there is nothing to share and nothing to corrupt.

## Tasks to do

### `1)` Recognise a task from a written path

1. A write inside `<repoRoot>/aidd_docs/tasks/<yyyy_mm>/<task_id>/` attaches the
   session to `<task_id>`.
2. A task exists in **either** shape: a `<task_id>/` directory, or a bare
   `<task_id>.md` file. `aidd_docs/tasks/2026_06/` in this repository holds both,
   side by side, so matching only the directory leaves real tasks unattachable.
3. Anchor the check at the repository root with a `/` boundary, never a bare
   string prefix — otherwise a sibling checkout `/foo/barbaz` matches `/foo/bar`.
4. Never guess a task from the branch, the cwd, or the most recently touched
   folder. No path is ever read or stat'd: it is pattern-matched only.

> A session that never writes into a task folder is out-of-flow, and that is
> correct rather than a gap. Evidence can add an attachment; it can never retract
> one.

### `2)` Open and close intervals

1. `SessionStart` opens one interval with `task_id: null`.
2. The first evidence **replaces** that placeholder rather than closing it and
   appending — otherwise "task A then task B" yields three intervals, not two.
3. Evidence naming a different task closes the open interval and opens a new one.

### `3)` Ignore `.aidd/`

1. Keep the `.gitignore` line. The directory is the CLI's own install manifest;
   it is neither tracked nor ignored by default, and `aidd clean` removes it.

### `4)` What this requires of `status`

1. Record in #617 that a session with no attachment is **out-of-flow, not a
   fault**, and must read differently from *hook silent*, which is one.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | A session that writes nowhere near a task folder produces one interval with `task_id: null`, never no record |
| 1 | A task written as a single `<task_id>.md` file attaches exactly like a folder |
| 1 | A path in a sibling checkout whose root is a string prefix of this one attaches nothing |
| 1 | A tool call carrying a `file_path`-shaped field but no write intent attaches nothing |
| 2 | A session writing into task A then task B produces exactly two intervals, with no gap and no overlap |
| 2 | Two concurrent sessions in the same checkout keep their own records and their own attachments |
| 3 | `git status` is clean after a session, with `.aidd/` present |
| 4 | `status` reports an unattached session as out-of-flow, not as an error |
