# Review: Gemini CLI flat build target (part 1 of 4)

- **Verdict**: changes-requested
- **Diff**: `be83f251...ad7a12f4`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_29
- **Findings**: 0 critical, 1 warning, 1 minor

## Phases

### Phase 1 — Register the tool identity

- [x] `pnpm typecheck` exits 0 with no `Record<ToolId, ...>` exhaustiveness error — `cli/src/infrastructure/assets/asset-loader.ts:38` adds the mandatory `gemini` `CONFIG_ASSETS` entry; Log confirms 0 errors (`part-1.md:261`)
- [x] `pnpm test:unit` exits 0 — Log: 1413/1413 (`part-1.md:261`)
- [x] The nine existing golden cells are unchanged — `cli/tests/golden/snapshots/framework-build/golden.json` diff is purely additive (single hunk appending `gemini:flat`, no edits to any pre-existing key)

### Phase 2 — Own the settings file

- [x] Merging twice produces identical bytes — `cli/tests/domain/formats/gemini-settings-merge.unit.test.ts:2434` ("merging twice produces identical bytes (idempotent)")
- [x] A pre-existing user `context.fileName` array retains its entries and gains `AGENTS.md` — `gemini-settings-merge.unit.test.ts:2440`
- [x] A user-authored unrelated key in the settings file survives every merge — `gemini-settings-merge.unit.test.ts:2454` (seed merge); `gemini-settings-merge.unit.test.ts:2357` (hooks merge, `mcpServers`/`context` survive)
- [x] An unmapped hook event produces a warning and no output entry — `gemini-settings-merge.unit.test.ts:2396`, implemented at `cli/src/domain/formats/gemini-settings-merge.ts:1566`

### Phase 3 — Add the plugin-exclusion mechanism

- [x] The build use-case contains no tool-name literal — `cli/src/application/use-cases/framework/framework-build-use-case.ts:1236` (`buildAllPlugins`) dispatches only through `strategy.shouldBuildPlugin`
- [x] A grep for `if (tool === ` and `if (kind === "agents")` in both orchestrators returns nothing — verified directly against the working tree, zero matches
- [x] Skipping a plugin is reported on stderr, and no skip is silent — `framework-build-use-case.ts:1244` (`this.logger.warn`), asserted in `plugin-exclusion.integration.test.ts:2270`

### Phase 4 — Declare the gemini flat contract

- [x] All six artifact kinds are declared; none is omitted — `cli/src/application/use-cases/framework/strategies/tool-contracts.ts:1392-1422` (`skills`/`agents`/`mcp`/`hooks: supported:true`, `rules`/`commands: supported:false`)
- [x] No `gemini:marketplace` row exists, and `--target gemini` without `--flat` exits 1 — `cli/src/infrastructure/deps.ts` registers only `"gemini:flat"`; `commands/framework.ts:66-71` exits 1 when `createFrameworkBuildUseCase` returns `undefined`; asserted in `cli/tests/e2e/framework-build.e2e.test.ts:2573` (AC #7)
- [x] Skills, agents, MCP and hooks all land at the mapped paths in a real build — `flat-build-strategy.integration.test.ts:1903`, e2e AC #6 (`framework-build.e2e.test.ts:2533`)
- [x] `.gemini/settings.json` contains `mcpServers`, `hooks` and `context.fileName` simultaneously — `flat-build-strategy.integration.test.ts:1929`, e2e AC #6

### Phase 5 — Prove it against the real binary

- [x] `gemini skills list --all` lists every published AIDD skill from `.agents/skills/` — self-reported, `part-1.md:264` (Log); not independently re-executed, see Verification
- [x] No agent file is rejected by the strict frontmatter schema — supported by the design at `tool-contracts.ts:1370` (`transformGeminiFlatAgent` rebuilds frontmatter to only `name`/`description`, per Amendments) and self-reported in `part-1.md:264`
- [x] The nine pre-existing golden keys are byte-identical to the pre-change baseline — same additive-only `golden.json` evidence as Phase 1
- [x] `cd cli && pnpm typecheck && pnpm lint && pnpm test` exits 0 modulo the 2 documented pre-existing failures — self-reported, `part-1.md:264`, explained in `part-1.md:243` (Amendments)

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 warning | rot | 4 | `cli/src/domain/tools/ai/gemini.ts:20-32` | `skillNameFromPath` and `buildGeminiSkillFilePath` are copy-pasted verbatim from `cli/src/domain/tools/ai/codex.ts:163-173`, crossing the project's own DRY threshold ("Extract private helper when ≥2 callers share identical logic", `cli/.claude/rules/07-quality/7-clean-code.md`). Before this diff there was exactly one implementation (codex); this diff adds the second, identical one instead of extracting | Move `skillNameFromPath`/`buildXSkillFilePath` into a shared `domain/formats/` (or `domain/tools/ai/`) helper parametrized by prefix, imported by both `codex.ts` and `gemini.ts` |
| 🟢 minor | rot | 1 | `cli/src/domain/tools/ai/gemini.ts:20` | Module-private `AGENTS_SKILLS_PREFIX = ".agents/skills/"` duplicates the exact literal this same diff just extracted into the shared, exported `AGENTS_SKILLS_PREFIX` in `cli/src/domain/formats/flat-paths.ts:15`. The extraction (Amendments, `part-1.md:247`) was scoped to `tool-contracts.ts` only, leaving `gemini.ts` (and pre-existing `codex.ts:33`) with their own copies of the same string | Import the shared constant from `flat-paths.ts` in `gemini.ts` (and `codex.ts` while there) instead of re-declaring it |

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (18/18 acceptance criteria checked)          |
| Files checked | `cli/src/domain/formats/gemini-settings-merge.ts`, `cli/src/domain/tools/ai/gemini.ts`, `cli/src/application/use-cases/framework/strategies/tool-contracts.ts`, `cli/src/application/use-cases/framework/framework-build-use-case.ts`, `cli/src/application/use-cases/framework/strategies/{flat,marketplace}-build-strategy.ts`, `cli/src/application/use-cases/framework/strategies/build-output-strategy.ts`, `cli/src/domain/tools/build-contract.ts`, `cli/src/domain/models/{tool-ids,framework-build}.ts`, `cli/src/domain/formats/flat-paths.ts`, `cli/src/infrastructure/{deps,assets/asset-loader}.ts`, `cli/src/application/commands/{ai,framework}.ts`, `cli/src/application/use-cases/menu-use-case.ts`, `cli/biome.json`, `cli/package.json`, `.github/workflows/ci.yml`, `cli/tests/**` (all new/changed gemini-related suites), `cli/tests/golden/snapshots/framework-build/golden.json`, `aidd_docs/tasks/2026_07/2026_07_27_gemini-cli-build-target/2026_07_27-511-gemini-cli-tool-{master,part-1}.md` |
| Unchecked     | none |
| Unplanned     | none — every changed file traces to the plan's "Files to modify/create" list or a phase Log entry |

Four Phase 5 criteria rest on the implementing agent's self-reported Log narrative (real `gemini` 0.52.0 binary run, real auth state) rather than an independent re-execution in this review, per this action's static-review-only constraint. The two claims checkable from the diff alone (golden-cell byte-identity, and the strict-frontmatter-safe transform design) are independently confirmed above.
