← [aidd-framework](../../README.md)

# aidd-telemetry

Measurement plugin for the AI-Driven Development framework.

> Status: alpha.

It journals every session so a unit of work can be tied to what it cost, and carries no measurement itself. No token, cost, model, or duration ever lands in a journal entry — those come from telemetry and are only made joinable to it.

It ships no skills, only hooks. On Claude Code, and only when a repository has committed `.aidd/config.json` with `telemetry.enabled: true`, it appends one line per observation to one file per session — `aidd_docs/runs/<run_id>__<vendor_id>.jsonl`, git-ignored (that directory is created on demand and is a location, not a permission), never rewritten. `session_start` opens the file; `turn_end` appends on every Stop; `file_written` appends a repository-relative path when a tool call lands inside `aidd_docs/tasks/<yyyy_mm>/<task_id>/` — no declared pointer, and never a `task_id` itself, since which task a path belongs to is a derivation for whatever reads the log, not a fact the hook writes. `aidd_docs/runs/README.md` documents the three line shapes; `aidd_docs/tasks/2026_08/2026_08_19_run-journal-event-log/plan.md` is what replaced the original mutable record with this append-only one; `aidd_docs/tasks/2026_08/2026_08_20_telemetry-export-enable/phase-1.md` tracks the switch itself.
