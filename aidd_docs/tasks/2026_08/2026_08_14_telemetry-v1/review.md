# Review: telemetry run journal, phases 1 to 5

- **Verdict**: approve — one high-severity defect found and fixed during this pass, re-verified at 119 tests green
- **Diff**: `9521ca66...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_20
- **Findings**: 1 high, 2 warning, 2 accepted — 3 fixed, 0 open

This review replaces the one dated 2026_08_18. That verdict described a design
that changed underneath it: attachment moved from a declared pointer to observed
evidence, the hook was split into modules, dispatch moved to argv, and the
storage moved into the repository. A verdict that survives its subject is worth
nothing, so it was redone against the tree rather than amended.

## Phases

### Phase 1 — Plugin shell and test runner

- [x] Installs from the local marketplace and lists as enabled, under an isolated `CLAUDE_CONFIG_DIR`
- [x] `recommended: false` genuinely excludes it — proven at `setup-plugins-prompt-use-case.ts:68`, not inferred from precedent
- [x] `sync-readme-counts.mjs --check` exits 0
- [x] Breaking an assertion makes `git commit` fail — verified with a real commit; a runner that cannot fail is not wired
- [x] Tests live in `scripts/__tests__/`, never inside the plugin

### Phase 2 — Host gate

- [x] Each recorded fixture resolves to its own host name, not to a shared `null` — asserting three nulls would pass against a detector that recognises nothing
- [x] Only `claude-code` writes; every other host and every malformed payload exits 0
- [x] Backslash paths detected, so the hook is not silently dead on Windows
- [x] Codex is tested first, proven load-bearing by a path matching both shapes
- [x] Fixtures redacted in exactly two named places, asserted rather than done once by hand

### Phase 3 — Opt-in and location

- [x] With `aidd_docs/runs/` absent, nothing is written and exit is 0
- [x] Records land in the repository, and nothing under any home directory
- [x] Markers tracked, records ignored, `git add -A` mid-session stages nothing — proven against a real temporary repository
- [x] Two repositories separable on `project_id`, which stays in the record though no longer in the path
- [x] A repository with no remote still produces a record, keyed on its basename

### Phase 4 — The record

- [x] Exactly ten keys; an eleventh fails, proven by injecting `cost_usd`
- [x] A missing `session_id` cannot produce a nine-key file
- [x] `vendor_field` is the export-side attribute, `session.id`
- [x] `parent_run_id` present and null
- [x] Lookup reads no run file; `project_id` derived once per invocation
- [x] p95 well inside 200 ms, measured against several hundred existing records
- [x] A hang fails the assertion rather than waiting for one

### Phase 5 — Attachment

- [x] A session writing nowhere near a task folder produces one interval with `task_id: null`
- [x] A task written as a single `.md` file attaches like a folder
- [x] A sibling checkout whose root is a string prefix of this one attaches nothing
- [x] A tool call carrying a path-shaped field but no write intent attaches nothing
- [x] Task A then task B produces exactly two intervals
- [x] **Two concurrent sessions in one checkout keep their own attachments** — re-proven under the observed design, since the previous proof tested a mechanism that no longer exists
- [x] Attached time covers the whole session — the defect below

### Phase 6 — Where a record goes

- [ ] Not part of this feature. The destination question belongs to the product

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🔴 | code | 5 | `plugins/aidd-telemetry/hooks/lib/attach.js` — `advanceTasks` | Writing to the **same** task a second time closed its interval, so attachment ended at the last write while the session carried on working. Measured: **1 second attached out of a 6-second session** entirely spent on that task. Worse than uniformly wrong — one write gave the right figure, two gave a wrong one, so the error depended on how often you happened to save. This is the one number the layer exists to produce | **Fixed in this pass.** Only moving to a *different* task closes an interval; `to: null` now consistently means attached until the session ends. Re-measured: alpha 2 s + beta 2 s = 4 s over a 4 s session. Two tests asserted the old behaviour and were rewritten — they codified the defect |
| 🟡 | rot | 5 | `aidd_docs/tasks/2026_08/2026_08_14_telemetry-v1/phase-5.md` | Described `.aidd/current-task` and a pointer written by the planning skills — a mechanism deleted the same day | **Fixed in this pass.** Rewritten around observed attachment, keeping both reasons the pointer was removed |
| 🟡 | rot | 4 | `docs/ARCHITECTURE.md:62` | Said the plugin "writes only a session's identity, not yet the full record". False since phase 4 | **Fixed in this pass** |
| 🟢 | code | 2 | `plugins/aidd-telemetry/hooks/lib/host.js` | `/\/projects\/.*\.jsonl$/` is greedy across separators, so a Codex transcript under a directory named `projects/` matches both patterns. Ordering is the only guard | Accepted. The guard is load-bearing rather than incidental: a test uses a path matching both shapes and goes red when the Codex branch is removed |
| 🟢 | code | 2 | `plugins/aidd-telemetry/hooks/journal.js` — `readStdin` | `readFileSync(0)` blocks until stdin closes, with no timeout | Accepted. Every tool measured closes it, and the latency assertion kills a real child process rather than waiting, so a hang fails rather than hangs |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (34/34) across phases 1–5. Phase 6 not counted: not part of this feature |
| Files checked | `plugins/aidd-telemetry/hooks/journal.js`, `hooks/lib/{host,repo,record,attach}.js`, `hooks/hooks.json`, `.claude-plugin/marketplace.json`, `.gitignore`, `release-please-config.json`, `.release-please-manifest.json`, `docs/{ARCHITECTURE,CATALOG}.md`, `README.md`, `lefthook.yml`, `scripts/__tests__/*` |
| Unchecked     | none |
| Unplanned     | Comment volume cut 556 → 173 lines across the plugin and its tests, on the rule that a comment survives only if it carries a fact unrecoverable from the code. The ten measured facts were each relocated to the narrowest scope that constrains them, and their survival was checked rather than assumed |
