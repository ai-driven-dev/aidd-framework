# Review: measurement on every tool (+ v1 close, + plugin hooks install)

- **Verdict**: blocked
- **Diff**: `HEAD...working tree` (45 modified, 26 untracked)
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_22
- **Findings**: 1 critical, 9 warning, 6 minor

## Phases

### plugin-hooks-install — Phase 1 — One place says which variable a tool expands

- [x] Every tool that runs hooks declares the variable it expands — `claude.ts:120`, `codex.ts:255`, `copilot.ts:326`, `cursor.ts:126`; pinned with an `examined !== 0` guard at `plugin-root-token-declaration.unit.test.ts:39-48`
- [x] The build route substitutes the declared token, with no copy of its own — `tool-contracts.ts:126,179,232,332` now read `<tool>.capabilities.plugins.pluginRootToken`; equality pinned at `plugin-root-token-declaration.unit.test.ts:90-94`
- [x] A tool that runs no hooks declares none, and nothing is substituted for it — `plugins-capability.ts:205` sets `pluginRootToken = null` in flat mode; guarded at `plugin-root-token-declaration.unit.test.ts:51-60`
- [ ] Codex's and Cursor's declared tokens are ones a running hook resolved — Cursor's was never observed; disclosed in `plan.md`'s callout → `not-applicable`
- [x] A token that was never measured is declared as such, not as a fact — `copilot.ts:326-328`

### plugin-hooks-install — Phase 2 — A tool that runs hooks receives them

- [x] A plugin installed for Codex carries its hooks — ran `aidd plugin install … --tool codex`: `.codex/plugins/aidd-telemetry/hooks/{hooks.json,journal.js,lib/*}` delivered
- [ ] A tool that runs no hooks receives none, and states why — no registered tool declares `acceptsHooks: false` any more (all five say `true`), so the branch has no production caller → `not-applicable`; the dead machinery is finding #2
- [x] No tool's hook support comes from a default — `plugins-capability.ts:189`, `:206`; the field is required by `HooksSupport`
- [x] An installed hook command names the target tool's own variable — ran both installs: Codex `node ${PLUGIN_ROOT}/hooks/journal.js …`, Claude `node ${CLAUDE_PLUGIN_ROOT}/…`. Cursor's answer deliberately changed in every-tool phase 6 (`node ./.cursor/hooks/aidd-telemetry/journal.js`); the declaration site never says so (finding #10)
- [ ] The same plugin, built and installed, yields the same hook command — for Cursor they now genuinely differ (build emits `${CURSOR_PLUGIN_ROOT}/hooks/…`, install emits `./.cursor/hooks/…`) and nothing invokes the build route to compare → `fix`
- [x] A script beside a hook arrives byte-for-byte, its plugin root untouched — verified on the live Codex install; `installed-hook-resolves.unit.test.ts:105-111`
- [x] A skill locates its own script after install, on every tool it was installed for — ran the action's own `find` line against a real Cursor and a real OpenCode install: both resolved (`~/.cursor/plugins/local/…/02-check/scripts/telemetry-check.js`, `./.opencode/skills/aidd-telemetry/02-check/…`). Copilot's root is still declaration-derived only
- [x] Every other `${...}` variable survives translation unchanged — holds by construction (`plugin-root-token-rewrite.ts:26` replaces one literal); still no test
- [ ] No document names a token that differs from the one the tool declares — `build-contract.ts:89` still lists `${COPILOT_PLUGIN_ROOT}`, which no tool declares → `fix`

### plugin-hooks-install — Phase 3 — An installed hook is proven to resolve

- [x] Every installed hook command resolves to a file that exists — `installed-hook-resolves.unit.test.ts:78-93`, non-empty guard at `:85`
- [x] An unexpanded variable fails the check, naming the tool — `:95-103`
- [x] The same install covers a hook and a script beside it — `:105-111`
- [ ] Both routes deliver hooks exactly when the tool runs them — `:134-146` drives the translator, not `writeHooks`; and the assertion is now trivially true because every tool sets `acceptsHooks: true` → `fix`
- [ ] The same hook command comes out of either route — `:126` still recomputes the build side as `rewritePluginRootToken(HOOKS_JSON, token)` instead of invoking it → `fix`
- [ ] A component missing from one route fails, naming it — no test compares the two routes' delivered file sets → `fix`
- [ ] Every tool's hook support is documented, including those with none — `docs/ARCHITECTURE.md:45-54` is now false for OpenCode and Cursor → `fix`

### telemetry-v1-close — Phase 1 — Copilot's own payload is the one we recognise

- [x] A real Copilot payload is held as a fixture, key set unmodified — `fixtures/copilot-compat-*.json`
- [x] Which events fired, and which did not, is written down — `fixtures/README.md:49-67` (now partly stale, finding #6)
- [x] The captured payload is recognised as Copilot, and its session id read — `hooks/lib/host.js:50-56`; `record.js:158-159`
- [x] A test fails if recognition of that shape regresses — `aidd-telemetry-journal.test.js`
- [x] An unrecognised payload is distinguishable from no payload at all — `journal.js:39-56`, `record.js:271-297`; the reader's own type check is missing (finding #11)

### telemetry-v1-close — Phase 2 — Each way the chain breaks is named as itself

- [x] The skill runs its own script, and reaches neither the CLI nor another skill — `telemetry-check.js:13-22` requires only `./lib/*`; proved by running the whole skill tree with no `hooks/` beside it
- [x] Every line is one claim, and carries what it was read from — ran it: four claims plus the uncovered lines, each with its source
- [x] Each of the four failures is induced and named as itself — `telemetry-check.test.js`, 68 tests pass
- [x] An uncovered tool is named with its reason and never counted as healthy — ran it against a live fixture project: `not covered: cursor --`, `not covered: copilot --`
- [x] With measurement off, the run stops and says so first — `telemetry-check.js:99-105`
- [x] A hook never observed firing reads as such, not as a broken install — `diagnose.js:110-132`, three-way plus the trust branch; the trust branch's gate is finding #4

### telemetry-v1-close — Phase 3 — The layer has met a hundred sessions

- [x] A hundred sessions over a year of day files answer — `telemetry-cost-report.test.js`
- [x] The breakdown reconciles to the total exactly — `assert.equal`, no tolerance
- [x] The timings are written down — `2026_08_21_telemetry-v1-close/measurements.md:101-117`
- [x] The cap is justified by a timing, in one line — `file-writes.js:63-68`
- [x] Reaching the cap says what was dropped — `file-writes.js:178-183`; ran a run file carrying `scan_truncated` through the report and the diagnostic, both ignore it. The watermark side effect is unfixed (finding #9)

### telemetry-v1-close — Phase 4 — A real multi-step flow reconciles

- [x] A real multi-step flow reports one row per step — `2026_08_21_telemetry-v1-close/measurements.md`
- [x] The breakdown reconciles to the total — same
- [x] Work outside any step reads unattributed — same
- [x] The diagnostic and the report agree on which sessions exist — same
- [x] Every epic boundary is stated as met or excluded, against real coverage — same

### telemetry-every-tool — Phase 1 — A script runs from the tree an install actually carries

- [x] Every skill script starts from a tree holding only `skills/` — ran `plugin-install-shape.test.js` on an untouched copy: 8/8 pass, three scripts discovered per shape
- [x] A script reaching outside it fails, naming the file — mutation: prepended `require("../../../hooks/lib/record.js")` to `02-check/scripts/lib/diagnose.js` in a copy → both shapes failed with "could not load … Cannot find module"
- [x] A script added later is covered without editing the test — mutation: added `skills/03-new/scripts/newthing.js` reaching across the boundary → the run went 8 tests to 10, and the new script failed on the flat shape
- [x] The same holds for the shape a native install delivers — the phase file admits the shape is reconstructed; verified it against a real `aidd plugin install --tool claude`, which produced exactly `.claude/plugins/aidd-telemetry/{skills,hooks}`. Nothing pins the reconstruction (finding #15's class)

### telemetry-every-tool — Phase 2 — Codex says when it is holding a hook back

- [x] Installing hooks for a gated tool names what still has to happen — ran it: `Plugin "aidd-telemetry" (codex): Codex will not run this plugin's hooks until each one is trusted — …`
- [x] A tool with no gate is told nothing about one — same run, `--tool claude` printed only `Plugin added successfully.`
- [ ] An untrusted hook reads as untrusted, never as never fired — the branch exists (`diagnose.js:33-42`, `hook-trust.js`) and is unit-tested, but `telemetry-check.js:120` only reads trust when `CODEX_THREAD_ID` is set, and `session-anchor.js:8-15` records that variable as measured only under `--dangerously-bypass-hook-trust` → `fix`
- [ ] Both answers come from a Codex session that was actually run — the plan's `measurements.md` has no Phase 2 section; nothing in the tree records a Codex session run untrusted and then trusted → `fix`

### telemetry-every-tool — Phase 3 — A Copilot session names the step it is in

- [x] A real Copilot skill call is held as a fixture, key set unmodified — `fixtures/copilot-compat-post-tool-use-skill.json`; provenance at `fixtures/README.md:69-79`
- [x] A Copilot session running a skill opens a step naming it — `step-starts.js:85-104`, driven by the captured payload
- [x] Both payload shapes open a step, or the unclaimed one is named as such — both readers wired through `skillNameFromAnyArgument`, both fixtures present
- [x] A tool call that is not a skill opens nothing — `copilot-compat-post-tool-use.json` (a Bash call) covers it
- [x] The limits document says what Copilot supplies, with the capture behind it — `docs/telemetry-limits.md:60-80`

### telemetry-every-tool — Phase 4 — Cursor either runs a plugin hook, or is known not to

- [x] What fires under Cursor is recorded per scope, interactive and headless — `measurements.md:5-232`, `:664-810`
- [x] What registers a plugin for Cursor is established, or stated as unknown — `measurements.md:95-140`
- [x] A mapping changes only where a probe showed which event marks the end — `measurements.md:753-800` ran both modes before `CURSOR_EVENT_MAP` changed
- [x] Cursor's entry in the limits document cites the session behind it — `docs/telemetry-limits.md:33-43`; its last sentence overstates (finding #7)

### telemetry-every-tool — Phase 5 — OpenCode's own session id reaches the journal

- [x] Whether an OpenCode session sees its own id is settled by running one — `measurements.md:427-484`
- [x] If it does, a sweep reaches that session without it being named by hand — `measurements.md:448-468` and `:1095-1137`; `readers.js:341-349` flipped, pinned against the CLI at `registry-conformance.unit.test.ts:290-308`
- [x] If it does not, the declared reason cites the probe — `not-applicable`, it does

### telemetry-every-tool — Phase 6 — Cursor's hooks install where Cursor reads them

- [x] Installing for Cursor writes hooks into the file Cursor reads — ran it: `.cursor/hooks.json` carries `sessionStart`/`stop`/`sessionEnd`/`postToolUse`, each `node ./.cursor/hooks/aidd-telemetry/journal.js …`
- [x] Nothing is left in the plugin directory Cursor does not read — same run: all 30 files under `~/.cursor/plugins/local/aidd-telemetry/` are `skills/**`, no `hooks.json`
- [x] An interactive Cursor session journals a start and a turn boundary — `measurements.md:776-786`
- [x] A headless one does too, from whichever event fires there — `measurements.md:762-771`
- [x] Cursor's repository root resolves from `workspace_roots` — `hooks/lib/repo.js:52`
- [x] Every other host's resolution is unchanged — `CWD_READER_BY_HOST` keeps `payload.cwd` for the other four and adds OpenCode on the same key

### telemetry-every-tool — Phase 7 — What was proven by hand is what an install delivers

- [ ] An OpenCode install delivers a module its loader runs — true of `aidd plugin install` (ran it: `.opencode/plugin/{opencode-plugin.js,journal.js,lib/*}`), false of `aidd setup --ai opencode --plugins aidd-telemetry` and of `aidd framework build --target opencode --flat`, which deliver nothing (finding #1) → `fix`
- [x] A session after that install journals — `measurements.md:876-965`; `opencode-plugin.test.js` drives the installed layout end to end
- [ ] No message claims hooks cannot work there — reproduced: `aidd setup --ai opencode --plugins aidd-telemetry` prints `Warning: Skipping hooks/ in plugin 'aidd-telemetry' (hooks not supported for this target).` → `fix`
- [x] A marketplace install puts Cursor's hooks where a local one does — `install-plugin-cursor-marketplace-hooks.integration.test.ts:200-213` drives both real translators
- [x] A test fails when the two routes disagree — same test, pinned to `cursor.ts`'s own `hooksDestination` at `:193-201`, so a shared regression fails too
- [x] Removing a plugin leaves nothing it merged or copied — ran install then remove for Cursor and OpenCode: `.cursor/hooks/aidd-telemetry/` gone, `.cursor/hooks.json` back to `{"version":1,"hooks":{}}`, `~/.cursor/plugins/local/aidd-telemetry/` gone, `.opencode/` gone with `opencode.json` untouched
- [x] Installing twice leaves one copy — `cursor-hooks-project-merge.unit.test.ts:22-35`; live, the second install is refused outright

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🔴 | functional | et p7 | `cli/src/application/use-cases/framework/strategies/tool-contracts.ts:785` | **The documented onboarding path for OpenCode ships no journal and says hooks are unsupported.** `buildOpencodeFlatContract` still declares `hooks: { supported: false }, // opencode has no HasHooks capability` — a comment that `opencode.ts:163-165` now contradicts. Reproduced twice on a clean temp project against `cli/dist/cli.js`: `aidd setup --source local --path <repo> --ai opencode --plugins aidd-telemetry --yes` prints `Warning: Skipping hooks/ in plugin 'aidd-telemetry' (hooks not supported for this target).` and creates no `.opencode/plugin/` at all; `aidd framework build --target opencode --flat` does the same (31 files, all `skills/`). Only `aidd plugin install <path> --tool opencode` delivers the module. So the tool the plan just proved can journal does not journal on the route `deps.ts:364` wires into `setup`, while `docs/telemetry-limits.md:136-139` states the journal now covers all five hosts. This fails phase 7 task 1 criteria 1 and 3 verbatim, and it is the milestone's own failure shape: an install that reports success and measures nothing. | Give the flat build contract a hooks artifact driven by `opencode.capabilities.plugins.flatHooksDir` (the same declaration `translateFlat` reads), so `writeHooks` copies `hooks/**` minus `hooks.json` into `.opencode/plugin/`. Delete the false comment. Add a test that fails when a tool declaring `acceptsHooks: true` gets `supported: false` from its build contract — the two-declaration-sites check that already exists for Cursor's destination. |
| 🟡 | rot | phi p2 / et p7 | `cli/src/domain/capabilities/plugins-capability.ts:100-104,110-115,128-131`; `cli/src/domain/models/plugin-content-translator.ts:286-297` | **A whole "a tool that runs no hooks says why" path with no production caller.** All five registered tools declare `acceptsHooks: true` (`grep acceptsHooks cli/src/domain/tools/ai/*.ts`) and no tool uses `mode: "unsupported"` anywhere. The diff admits it: `plugin-add-skip-warn.integration.test.ts:4-11` says "no live fixture currently exercises `collectHooksSkips`'s non-empty branch". So `hooksUnsupportedReason` on three param shapes, the `false` arms of `HooksSupport`/`FlatHooksSupport`, `UnsupportedPluginsParams`, and the hooks arm of `PluginTranslationSkip` are reachable only from test doubles. `plugin-content-translator.ts:289`'s `|| hooksUnsupportedReason === null` disjunct is dead outright: the constructor makes that field non-null exactly when `acceptsHooks` is false, so the first operand always short-circuits first. Phase 2 of plugin-hooks-install built this; phase 7 of every-tool removed its last consumer; nobody reconciled the two. | Decide one way. Either delete the `false` arms and the skip path and let a future tool re-add them with a caller, or keep them and say at the declaration that no shipped tool takes them today. Drop the dead disjunct either way. |
| 🟡 | rot | phi p3 | `docs/ARCHITECTURE.md:45-54` | The hook-support table added by this same diff is already false in two rows. Cursor reads "declared … Two headless probes fired no plugin hook at all", while phase 4 ran three probes including an interactive one and phase 6 has Cursor journalling in both modes. OpenCode reads "Runs bundled hooks: **no** … a declarative `hooks.json` means nothing to it", while `opencode.ts:163-165` declares `acceptsHooks: true` and an install delivers a module. The closing line "A tool that runs no hook says why" describes a state no tool is in. This is the first table a reader hits from the repo root. | Rewrite the Cursor and OpenCode rows from `measurements.md` phases 4-7, and replace the closing line with what is now true: every tool runs a delivered hook, and one of them gates it behind a trust grant. |
| 🟡 | functional | et p2 | `plugins/aidd-telemetry/skills/02-check/scripts/telemetry-check.js:120`; `skills/02-check/scripts/lib/session-anchor.js:8-15` | The Codex trust diagnosis — the whole point of phase 2 task 2 — only runs when `process.env.CODEX_THREAD_ID` is set, and the plugin's own comment says that variable was "measured in the environment of a shell command Codex ran under three bypass flags (… `--dangerously-bypass-hook-trust` …), not confirmed for a normal, trust-gated interactive session". The untrusted session is the only case the feature exists for, and its precondition is unmeasured there. If the variable is absent, the diagnostic falls back to `the hook has never been observed firing` — the exact wrong answer phase 2 was written to remove. Nothing in either `measurements.md` records a Codex session run with the hook untrusted. | Run one `codex exec` with the hook untrusted, `env | grep CODEX_THREAD_ID` inside it, and paste both the environment and the diagnostic's line, the way phases 4-7 paste theirs. If the variable is absent there, read the trust state from the presence of a Codex-shaped run file or a Codex plugin directory instead of from the anchor. |
| 🟡 | rot | et p6/p7 | `cli/src/application/use-cases/plugin/translator/project-hooks-materializer.ts:59`; `cli/src/application/use-cases/plugin/plugin-remove-use-case.ts:79`; `cli/src/domain/formats/cursor-hooks-project-merge.ts:15` | The declaration is tool-neutral and the implementation is not. `hooksDestination: "project"` reads as "the project's own hooks file", but `ProjectHooksMaterializer.mergeProjectHooksJson` hardcodes `join(projectRoot, ".cursor", "hooks.json")`, `PluginRemoveUseCase.removeProjectHooks` hardcodes the same string a second time, and `cursor-hooks-project-merge.ts` hardcodes `.cursor/hooks/`. A second tool that sets `"project"` — which the field's own doc comment invites — would silently have its hooks merged into Cursor's file and converted by `mergeCursorFlatHooks` into Cursor's event vocabulary. Three copies of one path, and a name that promises more than the code does. | Either name the destination on the capability (a `projectHooksPath` plus the merge function to use) so the three sites read it, or rename the field to say Cursor, per CLAUDE.md's "name by intention" and "no speculative generality". |
| 🟡 | rot | tv1c p1 / et p6 | `scripts/__tests__/fixtures/README.md:106-108`, `:120-121` | Stale in two places this diff invalidated. "All **four** hosts are declared in `lib/host.js`'s `DECLARED_HOSTS`" — there are five since `host.js:18` added `opencode`. And "**Cursor** fires no `Stop`-equivalent hook when run headless (`sessionEnd` arrives instead, and **is not mapped to `turn-end`** — see issue #680)" is now the opposite of the truth: `flat-hooks-merge.ts:41` fans `Stop` to `["stop", "sessionEnd"]`, and I read the mapping back out of a live install's `.cursor/hooks.json`. | Update both, and add OpenCode's entry to the host list saying it has no captured fixture because its payload is self-built by `hooks/opencode-plugin.js`. |
| 🟡 | rot | et p4/p6 | `docs/telemetry-limits.md:41-43` vs `cli/src/domain/formats/flat-hooks-merge.ts:32-40` | The doc states "Both are subscribed, so each mode records exactly one turn boundary" as a fact. The code comment three files away states the opposite premise — "A run file already tolerates more than one `turn_end` line (two real `stop` firings, one interactive session, Phase 4 addendum)" — and `measurements.md:284-289` shows that run file, two `turn_end` lines from one session. Phase 6 measured one boundary per mode on *clean* exits only, and says so ("in every session observed to date"); the doc drops the qualifier. A consumer counting turns from the doc's sentence would be wrong on an aborted session. | Say what was measured: a clean session in either mode records one boundary, and an interrupted one can record more, which readers tolerate. |
| 🟡 | fit | et p3 | `docs/telemetry-limits.md:88` | "All five tools now leave a run journal, **each proven by a session that was actually run**." Cursor, OpenCode, Codex and Claude Code each have a pasted run file in a `measurements.md`. Copilot has none: `2026_08_21_telemetry-v1-close/measurements.md:379` says "Copilot and Cursor were not run here", the every-tool `measurements.md` has no Phase 1-3 section at all, and what the Copilot captures establish is that its hook fires and what payload arrives — the journal write is proven by replaying those fixtures. That is a weaker chain than the sentence claims, in the document whose whole premise is that limits are established by probing. | Either paste a run file from the Copilot session that produced the fixtures, or narrow the sentence to what the capture supports: Copilot's hook fires and its payload is recognised, and the journal write from it is covered by replay. |
| 🟡 | code | tv1c p3 | `plugins/aidd-telemetry/hooks/lib/file-writes.js:168-183` | Unchanged, and still untested. `since = lastWriteMs(filePath)` is the run file's mtime, and appending the `scan_truncated` marker moves it. A turn that walked 2000 entries, found nothing, and gave up now pushes the next turn's window past writes a later, smaller walk would have recovered. `aidd-telemetry-file-writes.test.js:130-134` asserts the line appears and never what the next turn then sees. | Write the marker before the walk, or restore the mtime after it, and add a test where a file written during a truncated turn is still observed by the next one. |
| 🟡 | code | phi p2/p3 | `cli/tests/domain/models/installed-hook-resolves.unit.test.ts:68-75`, `:126` | The file's premise — "reads the command back out of what was installed" — is no longer true for Cursor. `installed()` calls `PluginContentTranslator` directly with the full distribution, while the real Cursor route passes `withoutHooks(dist)` (`mode-b-flat-materialization-translator.ts:97`), so every Cursor assertion here is about a plugin-scoped `hooks.json` no install produces. Separately, `:126` still recomputes the build side as `rewritePluginRootToken(HOOKS_JSON, token)` rather than invoking `MarketplaceBuildStrategy`, which is what phase 3's "the same hook command comes out of either route" asks for and what the prior review already named. | Drop Cursor from `HOOK_HOSTS`/`BUILT_BY` here and let `install-plugin-cursor-marketplace-hooks.integration.test.ts` own it, or drive Cursor through its real route. Drive the build side through the strategy for the remaining tools. |
| 🟢 | code | tv1c p1 | `plugins/aidd-telemetry/skills/02-check/scripts/telemetry-check.js:82-95` | Unchanged from the prior review, and reproduced. `readUnrecognisedPayload` never checks the line's `type` or that `at` is a string, unlike its sibling `readJournalFile` (`lib/journal.js:31-40`). Wrote `{"type":"session_start"}` into `aidd_docs/runs/_unrecognised.jsonl` in a temp project and ran the script: `hook fired FAIL a payload arrived and matched no known host at undefined`. Two defects in one line — a wrong claim, and `undefined` printed to the user. | Require `type === "unrecognised_payload"` and a string `at`; otherwise return null and let the generic fault answer. |
| 🟢 | conform | phi p2 | `cli/src/domain/tools/build-contract.ts:89` | `pluginRootToken`'s doc comment still lists `"${COPILOT_PLUGIN_ROOT}"` among its examples. No tool declares it — `copilot.ts:326` declares `${PLUGIN_ROOT}` — which is exactly what phase 2 task 3 asked to correct ("The rewrite's own documentation names Copilot's token as `${COPILOT_PLUGIN_ROOT}`; the declaration is what runs. Correct the prose."). The sibling `plugin-root-token-rewrite.ts` was corrected in this diff; this one was missed. | Drop the example list, or reduce it to the three constants the module actually exports. |
| 🟢 | rot | et p7 | `plugins/aidd-telemetry/hooks/opencode-plugin.js` (delivery) | OpenCode's ESM runtime module is delivered into every tool's hook directory. Verified on live installs: `.cursor/hooks/aidd-telemetry/opencode-plugin.js`, `.claude/plugins/aidd-telemetry/hooks/opencode-plugin.js`, `.codex/plugins/aidd-telemetry/hooks/opencode-plugin.js`. Four of five tools get a file only the fifth can load, sitting in the directory they scan for hook scripts. | Either move it out of `hooks/` into a directory only the flat route reads, or filter it in `translateNative` the way `hooks.json` is filtered in `flatHooksFiles`. |
| 🟢 | error-handling | et p5/p7 | `plugins/aidd-telemetry/hooks/opencode-plugin.js:30-35` | `spawnSync("node", …)` — deliberately not `process.execPath`, since OpenCode ships as its own binary — and the result is never inspected. A machine with OpenCode but no `node` on `PATH` journals nothing, forever, silently. Every other host runs `journal.js` under a Node that exists by construction; this is the one delivery route where it may not, and it is also the route whose earlier `file://` bug the phase-7 comment says was invisible for exactly this reason. | Check `result.error`/`result.status` once and record the failure where the diagnostic can see it, or state at the call site why a missing `node` is acceptable to lose. |
| 🟢 | rot | tv1c p2 | `scripts/__tests__/telemetry-check.test.js:484-493` | Every duplicated declaration is guarded, and I proved each guard fires: mutating `unrecognised.js`'s constant, `switch.js`'s predicate, `repo.js`'s git argv and `journal.js`'s bytes in a copy failed 6 tests. But the byte-parity block is still the hardcoded three-name allowlist the prior review flagged, so a fourth shared file added later announces nothing — `render.js` already exists in both `lib/` directories with different contents and no statement anywhere that the divergence is intended. | Enumerate both `lib/` directories and fail on any shared filename that is neither byte-identical nor on an explicit "deliberately different" list. |
| 🟢 | conform | - | `aidd_docs/tasks/2026_08/2026_08_22_telemetry-every-tool/plan.md:3` and `phase-{2..7}.md:2`; `aidd_docs/memory/testing.md:19` | Two bookkeeping carry-overs. The every-tool plan and six of its seven phase files still carry `status: pending` while their work is in this diff — the other two plans are all `done`. And the committed project memory still tells every contributor to "Run biome through `rtk proxy`", a personal token-proxy this repo neither declares nor installs. | Flip the statuses. State the `rtk` line as an environment caveat, not as the project's command. |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 84% (63/75)                                       |
| Files checked | `plugins/aidd-telemetry/hooks/{journal.js,opencode-plugin.js}`, `hooks/lib/{file-writes,host,record,repo,step-starts}.js`, `plugins/aidd-telemetry/skills/{00-init,01-cost,02-check}/**`, `plugins/aidd-telemetry/{CATALOG.md,README.md}`, `scripts/__tests__/{plugin-install-shape,telemetry-check,opencode-plugin,aidd-telemetry-file-writes,aidd-telemetry-journal,aidd-telemetry-cost-skill,telemetry-cost-report,telemetry-cost-readers}.test.js`, `scripts/__tests__/fixtures/README.md`, `cli/src/domain/capabilities/plugins-capability.ts`, `cli/src/domain/formats/{flat-hooks-merge,plugin-root-token-rewrite,cursor-hooks-project-merge}.ts`, `cli/src/domain/models/{plugin-content-translator,plugin-install-notice,plugin-translation-skip}.ts`, `cli/src/domain/tools/{build-contract.ts,ai/*.ts}`, `cli/src/application/use-cases/plugin/{plugin-add-use-case,plugin-remove-use-case}.ts`, `cli/src/application/use-cases/plugin/translator/{project-hooks-materializer,built-tree-materialization-translator,mode-b-flat-materialization-translator}.ts`, `cli/src/application/use-cases/framework/strategies/{tool-contracts,flat-build-strategy}.ts`, `cli/tests/domain/**`, `cli/tests/application/use-cases/plugin/**`, `cli/tests/helpers/telemetry-cost-readers.ts`, `docs/{ARCHITECTURE,CATALOG,telemetry-limits}.md`, `aidd_docs/memory/testing.md`, all three plans and both `measurements.md` |
| Unchecked     | phi p1 "Codex's and Cursor's declared tokens are ones a running hook resolved" — not-applicable; phi p2 "A tool that runs no hooks receives none, and states why" — not-applicable (no such tool exists any more); phi p2 "The same plugin, built and installed, yields the same hook command" — fix; phi p2 "No document names a token that differs from the one the tool declares" — fix; phi p3 "Both routes deliver hooks exactly when the tool runs them" — fix; phi p3 "The same hook command comes out of either route" — fix; phi p3 "A component missing from one route fails, naming it" — fix; phi p3 "Every tool's hook support is documented, including those with none" — fix; et p2 "An untrusted hook reads as untrusted, never as never fired" — fix; et p2 "Both answers come from a Codex session that was actually run" — fix; et p7 "An OpenCode install delivers a module its loader runs" — fix; et p7 "No message claims hooks cannot work there" — fix |
| Unplanned     | `scripts/test-changed.mjs` + `package.json:31` and the `aidd_docs/memory/testing.md` rewrite trace to no criterion in any of the three plans; the every-tool plan carries no `measurements.md` section for phases 1-3, so those three phases have no evidence record beside the fixtures; `plugin-add-opencode-hooks-skip.integration.test.ts` is deleted with its replacement asserting the opposite outcome, which is correct but traces to phase 7 task 1 rather than to the phase-1 comment it still carries |
