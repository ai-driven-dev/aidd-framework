---
status: pending
---

# Instruction: the written form

Part of [`plan.md`](./plan.md).

The hook stops rewriting files. Every observation becomes a line appended to one file per
session.

## Tasks to do

### `1)` One file, appended

1. `aidd_docs/runs/<run_id>__<vendor_id>.jsonl`, created on `SessionStart` with its
   `session_start` line, appended to thereafter.
2. Every write is an append of one line ending in `\n`. **No code path may read a run file
   in order to write it again.**

> This is the whole point. A JSON object cannot be appended to; a line-per-object file can.
> A truncated append costs one line, a truncated rewrite costs the run.

### `2)` The three line types

Every line carries `at` (ISO 8601, UTC, second precision as today) and `type`.

| `type` | Carries |
| --- | --- |
| `session_start` | `schema_version: 2`, `run_id`, `project_id`, `project_remote`, `tool`, `vendor_id`, `vendor_field` |
| `turn_end` | `prompt_id` when the payload provides one, omitted when it does not |
| `file_written` | `path`, relative to the repository root, `/`-separated on every platform |

### `3)` What is no longer written

1. `ended_at`, `tasks[]`, `parent_run_id` disappear from the written form.
2. `file_written` records the path only — **never** a `task_id`. The derivation belongs to
   the reader.

> Measured, and the reason `parent_run_id` goes rather than gets filled: a subagent shares
> its parent's `session_id`, and `SubagentStart`/`SubagentStop` carry an `agent_id`.
> Nesting is inside a run, not between runs.

### `4)` Keep every guarantee #620 established

1. Exit 0 whatever happens.
2. Zero dependencies beyond `node:`.
3. The telemetry switch is read fresh at every write, never cached.
4. One file per `vendor_id`: a second `SessionStart` for a session already journalled adds
   no second file, and no duplicate `session_start` line.
5. `GIT_*` stripped from every spawned git call.
6. Windows path separators normalised.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | After a session with N observations, the file has N lines and every earlier line is byte-identical to when it was written |
| 1 | No source file in `hooks/` both reads and writes the same run path |
| 2 | Each line type is asserted as an exact key set, so an eleventh key fails |
| 2 | `turn_end` omits `prompt_id` rather than writing null when the payload has none |
| 3 | No written line contains `ended_at`, `tasks`, `parent_run_id` or `task_id` |
| 4 | A second `SessionStart` for the same `vendor_id` adds neither a file nor a line |
| 4 | An unwritable directory still exits 0 |
