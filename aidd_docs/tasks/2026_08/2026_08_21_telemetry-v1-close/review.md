# Review: telemetry v1 close + plugin hooks install

- **Verdict**: blocked
- **Diff**: `HEAD...working tree` (30 modified, 12 untracked)
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_22
- **Findings**: 1 critical, 8 warning, 3 minor

## Phases

### plugin-hooks-install — Phase 1 — One place says which variable a tool expands

- [x] Every tool that runs hooks declares the variable it expands — `cli/src/domain/tools/ai/claude.ts:120`, `codex.ts:243`, `copilot.ts:326`, `cursor.ts:122`
- [x] The build route substitutes the declared token, with no copy of its own — `cli/src/application/use-cases/framework/strategies/tool-contracts.ts:126,179,232,332`
- [x] A tool that runs no hooks declares none, and nothing is substituted for it — `plugins-capability.ts:174`; `plugin-content-translator.ts:148`
- [ ] Codex's and Cursor's declared tokens are ones a running hook resolved — Cursor never observed; disclosed in `plan.md`'s callout → `not-applicable`
- [x] A token that was never measured is declared as such, not as a fact — `cursor.ts:117-121`, `copilot.ts:324-325`

### plugin-hooks-install — Phase 2 — A tool that runs hooks receives them

- [x] A plugin installed for Codex carries its hooks — `codex.ts:237`; `installed-hook-resolves.unit.test.ts:132-145`
- [x] A tool that runs no hooks receives none, and states why — `plugin-content-translator.ts:230-237`; `plugin-hooks-install.unit.test.ts:114-120`
- [x] No tool's hook support comes from a default — `plugins-capability.ts:105-112,158`
- [ ] An installed hook command names the target tool's own variable — unchanged: Cursor's installed command is `node ./hooks/journal.js`. Now disclosed in `docs/ARCHITECTURE.md:50` and pinned at `plugin-hooks-install.unit.test.ts:84`, but the criterion itself is still unmet
- [ ] The same plugin, built and installed, yields the same hook command — unchanged (same criterion as phase 3's "the same hook command comes out of either route")
- [x] A script beside a hook arrives byte-for-byte, its plugin root untouched — `plugin-hooks-install.unit.test.ts:89-95`
- [ ] A skill locates its own script after install, on every tool it was installed for — improved but still unmet: the search roots are corrected and tokenized (`aidd-telemetry-cost-skill.test.js:113-146`), yet nothing installs anything and the roots are string literals rather than each tool's `pluginsDir`
- [x] Every other `${...}` variable survives translation unchanged — holds by construction: `plugin-root-token-rewrite.ts:26` replaces one literal (still no test — see minor finding)
- [x] No document names a token that differs from the one the tool declares — `docs/ARCHITECTURE.md:50` now reads `./` with the converter's reason, verified against the installed output

### plugin-hooks-install — Phase 3 — An installed hook is proven to resolve

- [x] Every installed hook command resolves to a file that exists — `installed-hook-resolves.unit.test.ts:78-93`, guarded at `:85`
- [x] An unexpanded variable fails the check, naming the tool — `:95-102`
- [x] The same install covers a hook and a script beside it — `:104-110`, now asserting the delivered path set
- [ ] Both routes deliver hooks exactly when the tool runs them — unchanged: `:132-145` exercises the install route only
- [ ] The same hook command comes out of either route — unchanged: `:125` still recomputes the build side instead of invoking it
- [ ] A component missing from one route fails, naming it — unchanged: no test compares the two routes' delivered file sets
- [x] Every tool's hook support is documented, including those with none — `docs/ARCHITECTURE.md:45-54`

### telemetry-v1-close — Phase 1 — Copilot's own payload is the one we recognise

- [x] A real Copilot payload is held as a fixture, key set unmodified — `fixtures/copilot-compat-*.json`
- [x] Which events fired, and which did not, is written down — `fixtures/README.md`
- [x] The captured payload is recognised as Copilot, and its session id read — `hooks/lib/host.js:50-56`; `record.js:151`
- [x] A test fails if recognition of that shape regresses — `aidd-telemetry-journal.test.js:111-118,139-170`
- [x] An unrecognised payload is distinguishable from no payload at all — `journal.js:44-56` writes `aidd_docs/runs/_unrecognised.jsonl`; `diagnose.js:44-49,83-93` reads it by name and gives a third answer. Ran the hook by hand: a payload with no `cwd` key still leaves the marker, and the diagnostic then says "a payload arrived and matched no known host at …"

### telemetry-v1-close — Phase 2 — Each way the chain breaks is named as itself

- [x] The skill runs its own script, and reaches neither the CLI nor another skill — `aidd-telemetry-cost-skill.test.js:171-182,186-197` (it does now reach `hooks/lib/` — outside the criterion's words, inside the critical finding below)
- [x] Every line is one claim, and carries what it was read from — ran it: four claims, each with its source
- [x] Each of the four failures is induced and named as itself — `telemetry-check.test.js`, five induced, `deepEqual` on the FAIL label set. Verified by hand that a torn run file with no marker still reads as the generic fault, not the unrecognised one
- [x] An uncovered tool is named with its reason and never counted as healthy — `telemetry-check.test.js:754-786`; proved load-bearing by deleting the fallback in a copy, which fails both assertions
- [x] With measurement off, the run stops and says that first — `telemetry-check.js:97-100`
- [x] A hook never observed firing reads as such, not as a broken install — `diagnose.js:24-30,83-93`, now three-way

### telemetry-v1-close — Phase 3 — The layer has met a hundred sessions

- [x] A hundred sessions over a year of day files answer — `telemetry-cost-report.test.js`; re-ran: 66-78ms
- [x] The breakdown reconciles to the total exactly — `assert.equal`, no tolerance; task slice 15 of 365
- [x] The timings are written down — `measurements.md`
- [x] The cap is justified by a timing, in one line — `file-writes.js:61-66`
- [x] Reaching the cap says what was dropped — `file-writes.js:180-183`; every reader ignores the line (verified by running the diagnostic against a run file carrying one)

### telemetry-v1-close — Phase 4 — A real multi-step flow reconciles

- [x] A real multi-step flow reports one row per step — `measurements.md`
- [x] The breakdown reconciles to the total — `measurements.md`
- [x] Work outside any step reads unattributed — `measurements.md`
- [x] The diagnostic and the report agree on which sessions exist — the quoted block now carries all seven lines; its three static `not covered:` lines match the shipped script verbatim (the four session-specific lines remain unverifiable from here)
- [x] Every epic boundary is stated as met or excluded, against real coverage — `measurements.md`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🔴 | code | tv1c p1/p2 | `plugins/aidd-telemetry/skills/02-check/scripts/telemetry-check.js:20` | **New, introduced by the critical fix.** `require("../../../hooks/lib/record.js")` reaches out of the skill into the plugin's `hooks/` directory for one constant. On any install that does not carry `hooks/`, the script dies at load with `MODULE_NOT_FOUND` and a Node stack trace before its own try/catch (`:80-85`) can run — reproduced by running it from a plugin tree with `skills/` and no `hooks/`. OpenCode is exactly that install: `translateFlat` (`plugin-content-translator.ts:205-226`) delivers every `skills/**` file, including `scripts/*.js` (`plugin-distribution-reader-adapter.ts:143`), and records hooks only as skipped — and its flat layout puts the script at a different depth besides, so `../../../hooks/` cannot resolve there under any arrangement. This is the same cross-boundary require the team refused for `switch.js`; that refusal is correct (I verified the premise), so this file breaks the rule its sibling was written to obey. It also falsifies two statements corrected in this same round: `telemetry-check.js:5-6` "Zero dependencies … installing the plugin is the whole installation" and `README.md:18` "The scripts it ships are self-contained". No test covers it: 310 plugin specs pass. | Declare the constant in `02-check/scripts/lib/` and add that file to the parity allowlist in `telemetry-check.test.js:348`, the mechanism already in place for exactly this. Do not keep the cross-directory require. |
| 🟡 | functional | phi p2 | `cli/src/domain/formats/cursor-hooks.ts:38`, `plugin-content-translator.ts:124-149` | Unchanged. "An installed hook command names the target tool's own variable" still fails for Cursor: the converter turns `${CLAUDE_PLUGIN_ROOT}/` into `./` before `rewriteProse` runs, so the declared token never applies to the hook path. The doc now discloses it, which closes the documentation criterion but not this one. | Decide which answer Cursor gets and make the declaration match it, or state in `cursor.ts` that `pluginRootToken` governs the build route and `.mcp.json` only. |
| 🟡 | functional | phi p2/p3 | `cli/tests/domain/models/installed-hook-resolves.unit.test.ts:125` | Unchanged, and now provably a real divergence rather than an argued one: the repo's own `tests/application/use-cases/framework/marketplace-build-strategy.cursor.integration.test.ts:208` asserts the build route emits `${CURSOR_PLUGIN_ROOT}/hooks/`, while `plugin-hooks-install.unit.test.ts:84` asserts the install route emits `./hooks/journal.js`, for the same source file. Nothing compares them, because line 125 still recomputes the build side as `rewritePluginRootToken(HOOKS_JSON, token)` instead of invoking the route. | Drive the build side through `MarketplaceBuildStrategy` and compare the emitted command verbatim. Expect Cursor to fail; that is the finding. |
| 🟡 | functional | phi p3 | `cli/tests/domain/models/installed-hook-resolves.unit.test.ts:132-145` | Unchanged. "Both routes deliver hooks exactly when the tool runs them" is asserted for the install route alone; no test in this diff invokes `writeHooks`. | Run `writeHooks` for one plugin and one tool and assert hooks appear exactly when `acceptsHooks` is true. |
| 🟡 | functional | phi p3 | (no test) | Unchanged. The spec's `Done-when` "a test fails when the two install routes disagree about which files a plugin delivers" still has no test. | Build and install the same plugin for one tool, diff the delivered component sets, name the component present on one side only. |
| 🟡 | code | tv1c p3 | `plugins/aidd-telemetry/hooks/lib/file-writes.js:169-183` | Unchanged, and now reproduced. `since = lastWriteMs(filePath)` is the run file's mtime, and the truncation marker moves it. Built a month directory of `MAX_SCAN_ENTRIES + 300` task folders — the wide shape `measurements.md` documents — and measured: `{found: 0, truncated: true, scanned: 2000}`, then `handleTaskFilesObserved` advanced the run file's mtime by 188ms. A turn that recorded nothing now pushes the next turn's window past writes a later, smaller tree would have recovered. `aidd-telemetry-file-writes.test.js` asserts the line appears, never what the next turn then sees. | Write the marker without disturbing the watermark (before the walk, or restore mtime after), and test that a second turn still observes a file written during a truncated turn. |
| 🟡 | functional | phi p2 | `scripts/__tests__/aidd-telemetry-cost-skill.test.js:113-146` | Improved, still unmet. The search line now carries `.claude/plugins` and `.codex/plugins` ahead of `.`, the test tokenizes instead of substring-matching, and its comment correctly cites the project-relative `pluginsDir` declarations. But no install is exercised and the six roots are literals in the test rather than read from each tool's declaration, so a changed `pluginsDir` leaves the search stale with the test green. On the coordinator's question — the layout is observed for Claude (`tests/e2e/telemetry-hook-install.e2e.test.ts:45-52` installs into `projectDir/.claude/plugins/…` for real), and declaration-derived only for `.codex/plugins` and `.github/plugins`, which appear in no test anywhere. That is a narrower gap than "reconstructed", but not closed. | Derive the roots from `pluginsDir` / `userPluginsDir`, and prove the criterion once with an e2e that installs and then runs the located script. |
| 🟡 | rot | tv1c p2 | `scripts/__tests__/telemetry-check.test.js:348`, `:730-752` | Half fixed. The escaped copy is now guarded: `switch.js` is pinned to `hooks/lib/repo.js` by three fragments. Its stated justification is sound — I confirmed the translator delivers no `hooks/` on OpenCode and that requiring across that boundary throws — so keeping the copy is right. The structural limit remains: the parity block is still a hardcoded three-name allowlist that cannot notice a fourth shared file, and it did not notice the new `hooks/lib/record.js` coupling one file away. Of the three fragments, only `PREDICATE` is load-bearing; `"} catch {"` occurs many times in `repo.js` and asserts close to nothing. | Enumerate both `lib/` directories and fail on any shared filename that is not byte-identical, so a fifth copy announces itself. |
| 🟡 | fit | tv1c p2 | `plugins/aidd-telemetry/skills/02-check/scripts/lib/switch.js:9-16` vs `hooks/lib/repo.js:152-156` | **New.** The diagnostic and the hook disagree about whether a project can be measured, in the one place the skill claims they cannot. `switchOn` reads `.aidd/config.json` from the working directory; the hook additionally requires a git repository (`resolveRunsDir` → `getRepoRoot`). Ran both in a non-git directory with the switch on: a valid Claude Code `SessionStart` payload wrote nothing, and the diagnostic then reported `hook fired FAIL — the hook has never been observed firing`. The hook fired and was structurally unable to write; the diagnostic blames the hook. The new marker does not cover this, being behind the same gate. `switch.js:3-4` calls this exact shape "the exact lie this milestone exists to remove". | Have the diagnostic resolve the repository the way the hook does and, when there is none, say so as its own answer rather than reporting a dead hook. |
| 🟢 | code | tv1c p1 | `plugins/aidd-telemetry/skills/02-check/scripts/telemetry-check.js:80-93` | **New.** `readUnrecognisedPayload` never checks the line's `type`, unlike its sibling `readJournalFile` (`lib/journal.js:32-40`). Ran it: a marker file holding `{"type":"session_start","at":…}` is accepted as an unrecognised-payload claim, and one with no `at` prints `matched no known host at undefined` to the user — the same `undefined` leak the `render.js` fix in this round added assertions against two files away. A torn (unparseable) marker correctly falls back to the generic fault. | Require `type === "unrecognised_payload"` and a string `at`; otherwise return null. |
| 🟢 | code | phi p2 | `cli/src/domain/models/plugin-content-translator.ts:143-150` | Unchanged. "Every other `${...}` variable survives translation unchanged" still has no test, though `rewriteProse` widened the substitution from hook manifests to every non-verbatim file. Holds by construction. | One test: a skill markdown carrying `${HOME}` and `${CLAUDE_PLUGIN_ROOT}` comes back with only the second rewritten. |
| 🟢 | conform | - | `aidd_docs/memory/testing.md:19` | Unchanged. The committed project memory still instructs every contributor to "Run biome through `rtk proxy`", a personal token-proxy from the user's own global config that this repo neither declares nor installs. | State it as an environment caveat, not as the project's command. |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 83% (35/42)                                       |
| Files checked | `plugins/aidd-telemetry/hooks/journal.js`, `hooks/lib/{file-writes,host,record,repo}.js`, `plugins/aidd-telemetry/skills/02-check/**`, `skills/{00-init,01-cost,02-check}/actions/01-*.md`, `plugins/aidd-telemetry/{CATALOG.md,README.md}`, `scripts/__tests__/{telemetry-check,aidd-telemetry-file-writes,aidd-telemetry-journal,telemetry-cost-report,aidd-telemetry-cost-skill}.test.js`, `scripts/__tests__/fixtures/`, `cli/src/domain/{capabilities/plugins-capability.ts,models/plugin-content-translator.ts,formats/{cursor-hooks,plugin-root-token-rewrite}.ts,tools/ai/*.ts}`, `cli/src/application/use-cases/framework/strategies/{tool-contracts,marketplace-build-strategy}.ts`, `cli/src/infrastructure/adapters/plugin-distribution-reader-adapter.ts`, `cli/tests/domain/models/{installed-hook-resolves,plugin-hooks-install}.unit.test.ts`, `cli/tests/domain/tools/plugin-root-token-declaration.unit.test.ts`, `cli/tests/application/use-cases/framework/marketplace-build-strategy.cursor.integration.test.ts`, `cli/tests/e2e/telemetry-hook-install.e2e.test.ts`, `docs/{ARCHITECTURE,CATALOG}.md`, `aidd_docs/memory/testing.md`, `aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/measurements.md` |
| Unchecked     | phi p1 "Codex's and Cursor's declared tokens are ones a running hook resolved" — not-applicable; phi p2 "An installed hook command names the target tool's own variable" — fix; phi p2 + p3 "The same hook command comes out of either route" (one criterion, both phases) — fix; phi p2 "A skill locates its own script after install" — fix; phi p3 "Both routes deliver hooks exactly when the tool runs them" — fix; phi p3 "A component missing from one route fails, naming it" — fix |
| Unplanned     | `scripts/test-changed.mjs` + `package.json:31` and its `aidd_docs/memory/testing.md` entries trace to no criterion (ran it: 118 CLI test files including e2e, plus the reaching plugin specs, exit 0); `plugins/aidd-telemetry/skills/00-init/actions/01-check.md` search-path change belongs to phi p2 task 3, whose file list does not name the init skill; `telemetry-check.js:20`'s reach into `hooks/lib/` traces to no criterion and is the critical finding above |
