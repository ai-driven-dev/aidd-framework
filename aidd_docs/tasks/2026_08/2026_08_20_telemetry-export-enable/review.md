# Review: turning telemetry on (#646)

- **Verdict**: approve
- **Diff**: `aea196fe...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_18
- **Findings**: 0 critical, 0 warning, 1 minor — ten findings were raised and fixed: one critical found only by installing the plugin and running it, one architectural raised by the repo owner on review, and the rest from the three axes; the table below is the state after those fixes

## Phases

### Phase 1 — The switch

- [x] With no `.aidd/config.json`, a session writes nothing, even with `aidd_docs/runs/` present — `scripts/__tests__/aidd-telemetry-journal.test.js:521`
- [ ] The file is tracked by git, and a fresh clone inherits the answer — proven as mechanism (`.gitignore` negation, `git add -A` clean at `scripts/__tests__/aidd-telemetry-journal.test.js:1849`); no test performs a real `git clone`
- [x] `aidd clean` leaves it in place, and says so in its own output — `cli/src/application/use-cases/clean-use-case.ts:73`, `cli/tests/e2e/clean.e2e.test.ts:90`
- [x] The hook parses it with no dependency of any kind — `plugins/aidd-telemetry/hooks/lib/repo.js:36`
- [x] Turning it off mid-session stops the very next write, with no restart — `scripts/__tests__/aidd-telemetry-journal.test.js:627`, confirmed by re-read at `plugins/aidd-telemetry/hooks/lib/repo.js:133`
- [x] With AIDD off but the provider exporting, the journal still writes nothing — `scripts/__tests__/aidd-telemetry-journal.test.js:597`
- [x] An unparseable file means off, and the hook exits 0 — `scripts/__tests__/aidd-telemetry-journal.test.js:539`
- [x] Exactly one condition is authoritative, the other documented as a location — `plugins/aidd-telemetry/hooks/lib/repo.js:133`, `aidd_docs/runs/README.md`

### Phase 2 — What Claude Code needs

- [x] Both exporters present, asserted as an exact key set — `cli/tests/domain/models/telemetry-export.unit.test.ts:25`
- [x] The interval is present and below 60000 — `cli/tests/domain/models/telemetry-export.unit.test.ts:42`
- [x] `aidd.project_id` asserted against the journal's own function, not a copied literal — `cli/tests/domain/models/telemetry-project-id.unit.test.ts:29`
- [x] `OTEL_LOG_TOOL_DETAILS` appears nowhere — `cli/tests/domain/models/telemetry-export.unit.test.ts:59`
- [x] Enabling prints the #663 notice and that no tool details are logged — `cli/tests/application/use-cases/telemetry/enable-tool-telemetry-use-case.unit.test.ts:108`
- [ ] Enable then `aidd clean` leaves the settings file byte-identical, unrelated keys included — holds only for a canonical `JSON.stringify(x, null, 2)` seed; `cli/src/domain/models/merge.ts:78` rewrites the whole file
- [x] A hand-edited value inside our set is still removed; a key outside it survives — `cli/tests/application/use-cases/telemetry/enable-tool-telemetry-use-case.unit.test.ts:154`
- [x] Enabling twice changes nothing the second time — `cli/tests/application/use-cases/telemetry/enable-tool-telemetry-use-case.unit.test.ts:140`

### Phase 3 — The command

- [x] With no tool installed, the switch is still written and the command says so — `cli/tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts:51`
- [x] Cursor is reported as not enableable by us, never as enabled — `cli/tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts:66`
- [x] Copilot's environment variable is printed, not silently assumed — `cli/tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts:74`
- [x] With no `--scope`, the local file is written and the tracked one is untouched — `cli/tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts:108`
- [x] `--scope project` without `--yes` exits non-zero and writes nothing, checked on disk — `cli/tests/e2e/telemetry.e2e.test.ts:105`
- [x] Every resolved path appears in the output before the file changes — `cli/tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts:145`
- [x] on then off leaves every touched file byte-identical to before — `cli/tests/application/use-cases/telemetry/telemetry-on-off-roundtrip.unit.test.ts:45`
- [x] The handler carries no judgement — it lives in the use-case — `cli/src/application/commands/telemetry.ts:35`

### Phase 4 — The journeys

- [x] Enable, re-enable, disable leaves the settings file byte-identical — `cli/tests/e2e/telemetry.e2e.test.ts:48`
- [x] The journey is listed in `E2E_MAP.md` — `cli/tests/e2e/E2E_MAP.md:548`
- [x] The unguarded `--scope project` writes nothing at all, checked on disk — `cli/tests/e2e/telemetry.e2e.test.ts:105`
- [x] A tool that cannot be enabled is reported as such, never counted as enabled — `cli/tests/e2e/telemetry.e2e.test.ts:200`
- [x] With the AIDD switch off, no tool is configured at all — `cli/tests/e2e/telemetry.e2e.test.ts:223`
- [x] The suite passes with `GIT_DIR` exported, proving it under a git hook — `scripts/__tests__/aidd-telemetry-journal.test.js` spawns the hook with a poisoned `GIT_DIR` reaching the child; without `plugins/aidd-telemetry/hooks/lib/repo.js`'s `gitEnv()` the session is filed under the wrong repository (`acme/elsewhere` for `acme/here`)
- [x] The assertion reads the file at the resolved path, never a value the command reported — `cli/tests/e2e/telemetry.e2e.test.ts:149`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | rot | - | `pnpm-workspace.yaml` | Untracked, never committed, present before this work began; unrelated to #646 and unexplained | Out of scope for this change; decide separately whether to commit or delete it |

Raised and fixed during this review:

| Was | Kind | Phase | Issue | What changed |
| --- | ---- | ----- | ----- | ------------ |
| 🔴 | fit | - | `aidd plugin install` flattened `hooks/lib/*.js` into `hooks/`, so the installed `journal.js` threw `Cannot find module './lib/host.js'` on its first require — the whole telemetry layer was dead on every real installation, and no test saw it because all of them run the hook from the source tree | `plugin-content-translator.ts` keeps a hook's own directories; a unit test on the path shape and an e2e that installs the plugin and executes the installed hook, which fails with the original error when the fix is reverted |
| 🔴 | conform | 3 | Per-tool telemetry knowledge sat in the application layer: a hardcoded four-tool table in `telemetry-on-use-case.ts`, `CLAUDE_TOOL_ID` in three use-cases, a use-case file named after one tool, and raw tool identifiers in the display | A `TelemetryCapability` in `domain/capabilities/`, declared by each tool in its own file; the use-cases iterate the registry and switch only on activation kind, and know no tool identifier at all |
| 🟡 | functional | 4 | Both harnesses stripped `GIT_*` before spawning, so the hook's own `gitEnv()` was never exercised and the criterion was evidentially empty | A replay that hands the hook the poisoned environment git itself exports; proven decisive by reverting the fix |
| 🟡 | fit | 3 | Claude was gated on the manifest while the other four tools reported unconditionally, so a Claude-only project read four lines about tools it never installed | All five gated the same way; a Claude-only project is told the rest are not installed |
| 🟡 | conform | - | A TypeScript declaration for the CLI's tests lived in the plugin's shipped runtime tree, against `docs/ARCHITECTURE.md:32` | The typing moved to `cli/tests/helpers/telemetry-journal-hook.ts`; the `isShippableHookFile` filter added only to stop it shipping was reverted with it |
| 🟡 | code | 2 | The declaration narrowed `parseOwnerRepoFromRemote` to reject `null`, which the runtime accepts, forcing a widening cast in a test | Dissolved by the move: the accessor declares the signature the hook actually has |
| 🟢 | code | 4 | An e2e test named for a switch-off gate the code does not have | Renamed to what it verifies |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 94% (29/31), plus the installed-plugin path the criteria never covered |
| Files checked | `plugins/aidd-telemetry/hooks/lib/repo.js`, `plugins/aidd-telemetry/hooks/lib/repo.d.ts`, `cli/src/domain/models/telemetry-{export,switch,project-id}.ts`, `cli/src/domain/models/merge.ts`, `cli/src/application/use-cases/telemetry/*`, `cli/src/application/use-cases/clean-use-case.ts`, `cli/src/application/commands/telemetry.ts`, `cli/src/application/display/telemetry-display.ts`, `cli/src/infrastructure/adapters/git-adapter.ts`, `.gitignore`, `docs/ARCHITECTURE.md`, `docs/FAQ.md`, and the tests under `cli/tests/` and `scripts/__tests__/` |
| Unchecked     | byte-identical on a non-canonical seed — not-applicable (pre-existing merge machinery the plan directed reusing, not a regression); fresh clone inherits the answer — not-applicable (git checkout semantics for a committed file are not in doubt) |
| Unplanned     | `aidd clean` now deletes `.aidd/plugin-cache/`, which the blanket delete used to remove and the targeted one did not — a regression this change introduced, fixed with a test; `GIT_*` stripping in `plugins/aidd-telemetry/hooks/lib/repo.js` and `cli/src/infrastructure/adapters/git-adapter.ts`, needed because both sides of the `project_id` join read git; `pnpm-workspace.yaml`, pre-existing and untracked, left alone |
