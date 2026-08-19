# Review: the run journal becomes an event log

- **Verdict**: approve
- **Diff**: `HEAD...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_19
- **Findings**: 0 critical, 1 warning, 0 minor — one critical and four others were raised and fixed in this pass; the table below is the state after those fixes

## Phases

### Phase 1 — The written form

- [x] After a session with N observations, the file has N lines and every earlier line is byte-identical — `scripts/__tests__/aidd-telemetry-journal.test.js:1791` (three snapshots, compared consecutively)
- [x] No source file in `hooks/` both reads and writes the same run path — `plugins/aidd-telemetry/hooks/lib/record.js`, `file-writes.js`, guarded statically at `scripts/__tests__/aidd-telemetry-journal.test.js:1850`
- [x] Each line type asserted as an exact key set — `scripts/__tests__/aidd-telemetry-journal.test.js:711`, `:770`, `:788`, `:1771`
- [x] `turn_end` omits `prompt_id` rather than writing null — `plugins/aidd-telemetry/hooks/lib/record.js:137`
- [x] No written line contains `ended_at`, `tasks`, `parent_run_id` or `task_id` — `scripts/__tests__/aidd-telemetry-journal.test.js:828`
- [x] A second `SessionStart` for the same `vendor_id` adds neither a file nor a line — `scripts/__tests__/aidd-telemetry-journal.test.js:935`
- [x] An unwritable directory still exits 0 — `scripts/__tests__/aidd-telemetry-journal.test.js:982`

### Phase 2 — The tests

- [x] Each line type has an exact-key-set assertion — `SESSION_START_KEYS` / `TURN_END_KEYS` / `FILE_WRITTEN_KEYS`, `scripts/__tests__/aidd-telemetry-journal.test.js:21`
- [x] No test references `THE_TEN_KEYS`, `tasks[]`, `ended_at` or `parent_run_id` — verified by grep, live references are zero
- [x] Removed tests are named — seven removed, six `advanceTasks` unit tests plus one `parent_run_id` test, each named in-file with its reason
- [x] A test proves earlier lines are byte-identical after a later append — `scripts/__tests__/aidd-telemetry-journal.test.js:1791`
- [x] A test proves a truncated final line does not cost the lines before it — `scripts/__tests__/aidd-telemetry-journal.test.js:1822`, truncating a real file mid-line
- [x] `node --test "scripts/__tests__/**/*.test.js"` is green — 129 passing

### Phase 3 — The documents

- [x] No document shows `tasks[]`, `ended_at` or `parent_run_id` as written fields — `aidd_docs/runs/README.md`, `plugins/aidd-telemetry/README.md`, `docs/ARCHITECTURE.md`, plus `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` corrected in this pass
- [x] `markdown-links` passes — 0 broken in 697 files
- [x] `schema_version: 2` appears with its rationale — `aidd_docs/runs/README.md:9`
- [x] The #620 folder points here rather than being edited into agreement — `aidd_docs/tasks/2026_08/2026_08_14_telemetry-v1/plan.md:68`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 | fit | - | `plugins/aidd-telemetry/hooks/lib/file-writes.js:79` | `file_written` never fires for a write outside a task folder, so a session working entirely out of flow leaves no path evidence and reads as an idle session. Out-of-flow cost stays computable as a residual — total minus attributed — but never at file granularity | A decision for the repository owner, not a defect: measured at **4.6 ms** per write, so the cost of recording everything is not performance but scope — the journal would then hold every path a person touched, in a file designed to reach a sink |

Raised and fixed during this review:

| Was | Kind | Issue | What changed |
| --- | ---- | ----- | ------------ |
| 🔴 | conform | `project_remote` wrote the raw `git remote get-url origin` output, so a token-authenticated remote put a live credential in a journal designed to be shipped. This repository had already ruled on the same class twice: `telemetry-v1/phase-2.md` calls it "precisely the class of leak this layer exists to avoid", and #646 withholds tool-input logging for the same reason | Userinfo stripped from scheme-bearing URLs before the value is recorded; proven decisive by reverting the fix, which fails on `the token must not appear anywhere in the file` |
| 🟡 | code | A comment named `buildRecord`, renamed in this same diff, and described "a nine-key file, not ten" — a shape that no longer exists | Rewritten to say what the guard actually protects: a `session_start` line missing the key every later join depends on |
| 🟡 | functional | The static append-only guard grepped only for the literal `readFileSync`, so a regression through `fs.readFile`, `createReadStream` or `openSync` would pass it | Widened to every read API |
| 🟡 | rot | `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` still showed the old record as current, and still said each delivery skill writes its own `steps` entry — a premise this design retired | Marked superseded on the four points that changed, pointing here, without rewriting the rest into agreement |
| 🟢 | rot | `attach.js` still carried the name of the attachment concept the rewrite retired | Renamed `file-writes.js`, with its callers and its exports |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (18/18 acceptance criteria) |
| Files checked | `plugins/aidd-telemetry/hooks/{journal.js,lib/*}`, `scripts/__tests__/aidd-telemetry-*.js`, `cli/tests/e2e/telemetry-hook-install.e2e.test.ts`, `aidd_docs/runs/README.md`, `plugins/aidd-telemetry/README.md`, `docs/ARCHITECTURE.md`, `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` |
| Unchecked     | none |
| Unplanned     | the credential redaction and its two tests, which the plan should have required and did not; the `attach.js` rename |
