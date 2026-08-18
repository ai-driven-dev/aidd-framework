# aidd_docs/runs

Where the run journal's records land once AIDD telemetry is turned on. This directory being present or committed is **no longer the permission** — that demotion happened in [phase 1 of the telemetry-export-enable plan](../tasks/2026_08/2026_08_20_telemetry-export-enable/phase-1.md). The single authoritative switch is `.aidd/config.json`'s `telemetry.enabled`, read by `plugins/aidd-telemetry/hooks/journal.js` at the point of every write, never cached across a session. With that switch on, `aidd_docs/runs/` is created on demand if it does not already exist; with it off, no record lands here regardless of whether this directory exists. Records are ignored by git (see `.gitignore`), so cloning the repository never carries anyone's session history.

Whether any of these records is ever shared beyond the machine that wrote it is undecided, and tracked by [phase 6](../tasks/2026_08/2026_08_14_telemetry-v1/phase-6.md).
