# aidd_docs/runs

Committing this directory opts the repository into the run journal: `plugins/aidd-telemetry/hooks/journal.js` only writes a session's record when it finds this directory here, and it writes it right here, in `aidd_docs/runs/`. Records are ignored by git (see `.gitignore`), so cloning the repository carries the opt-in without carrying anyone's session history.

Whether any of these records is ever shared beyond the machine that wrote it is undecided, and tracked by [phase 6](../tasks/2026_08/2026_08_14_telemetry-v1/phase-6.md).
