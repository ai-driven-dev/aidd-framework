# aidd_docs/runs

Where the run journal's records land once AIDD telemetry is turned on. This directory being present or committed is **no longer the permission** — that demotion happened in [phase 1 of the telemetry-export-enable plan](../tasks/2026_08/2026_08_20_telemetry-export-enable/phase-1.md). The single authoritative switch is `.aidd/config.json`'s `telemetry.enabled`, read by `plugins/aidd-telemetry/hooks/journal.js` at the point of every write, never cached across a session. With that switch on, `aidd_docs/runs/` is created on demand if it does not already exist; with it off, no record lands here regardless of whether this directory exists. Records are ignored by git (see `.gitignore`), so cloning the repository never carries anyone's session history.

## Shape

One file per session: `<run_id>__<vendor_id>.jsonl`. One JSON object per line, appended and never rewritten — a JSON object is a closed block that can only be rewritten whole, so this is what lets a session leave two hundred observations at the cost of two hundred appends instead of two hundred rewrites, and what lets a process that dies mid-write lose at most the one line it was writing.

`schema_version: 2` on the `session_start` line. Version 1 was a single mutable ten-key object per session, rewritten on every turn (`ended_at`, `tasks[]`, `parent_run_id` among its fields) — replaced because a value frozen at write time cannot be revised, and the hook was writing conclusions (an interval a task attached to, a session's end time) instead of observations. See [`aidd_docs/tasks/2026_08/2026_08_19_run-journal-event-log/plan.md`](../tasks/2026_08/2026_08_19_run-journal-event-log/plan.md).

Every line carries `at` (ISO 8601, UTC, second precision) and `type`:

| `type` | Carries | Fired by |
| --- | --- | --- |
| `session_start` | `schema_version`, `run_id`, `project_id`, `project_remote`, `tool`, `vendor_id`, `vendor_field` | SessionStart |
| `turn_end` | `prompt_id` when the host provides one, omitted otherwise | Stop |
| `file_written` | `path`, repository-relative and `/`-separated | PostToolUse, for a write that lands inside a task folder |

`file_written` never carries a `task_id`: task identity is a derivation from the path, and derivations belong to whatever reads the log, not to the hook that writes it.

Whether any of these records is ever shared beyond the machine that wrote it is undecided, and tracked by [phase 6](../tasks/2026_08/2026_08_14_telemetry-v1/phase-6.md).
