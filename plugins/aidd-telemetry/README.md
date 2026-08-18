← [aidd-framework](../../README.md)

# aidd-telemetry

Measurement plugin for the AI-Driven Development framework.

> Status: alpha.

It journals every session so a unit of work can be tied to what it cost, and carries no measurement itself. No token, cost, model, or duration ever lands in a journal entry — those come from telemetry and are only made joinable to it.

It ships no skills, only hooks. On Claude Code, and only when a repository has committed `.aidd/config.json` with `telemetry.enabled: true`, it writes one record per session into `aidd_docs/runs/`, git-ignored (that directory is created on demand and is a location, not a permission), and attaches it to work by observing where a session actually writes: when a tool call lands inside `aidd_docs/tasks/<yyyy_mm>/<task_id>/`, that session is working on `<task_id>` — no declared pointer, and a session that never writes into a task folder stays unattached. `aidd_docs/tasks/2026_08/2026_08_14_telemetry-v1/plan.md` tracks the phases that shaped the record; `aidd_docs/tasks/2026_08/2026_08_20_telemetry-export-enable/phase-1.md` tracks the switch itself.
