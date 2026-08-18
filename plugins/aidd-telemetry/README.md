← [aidd-framework](../../README.md)

# aidd-telemetry

Measurement plugin for the AI-Driven Development framework.

> Status: alpha.

It journals every session so a unit of work can be tied to what it cost, and carries no measurement itself. No token, cost, model, or duration ever lands in a journal entry — those come from telemetry and are only made joinable to it.

It ships no skills, only hooks. On Claude Code, and only when a repository has opted in by committing `aidd_docs/runs/`, it writes one record per session into that same `aidd_docs/runs/` directory, git-ignored, and attaches it to work by observing where a session actually writes: when a tool call lands inside `aidd_docs/tasks/<yyyy_mm>/<task_id>/`, that session is working on `<task_id>` — no declared pointer, and a session that never writes into a task folder stays unattached. `aidd_docs/tasks/2026_08/2026_08_14_telemetry-v1/plan.md` tracks the phases that shaped the record.
