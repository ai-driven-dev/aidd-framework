# Review: Transform Codex marketplace skills

- **Verdict**: approve
- **Diff**: `main...20e46f31967a308c795015c975fd89967ba2cdf1 + worktree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026-08-03
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Apply and prove skill transformation

- [x] A Codex marketplace build emits every `SKILL.md` using the Codex frontmatter allowlist while source skills remain unchanged; auxiliary Markdown assets remain byte-preserved. — `cli/src/application/use-cases/framework/strategies/marketplace-build-strategy.ts:80-84`, `cli/src/application/use-cases/framework/strategies/marketplace-strategy-helpers.ts:93-102`, `cli/src/application/use-cases/framework/strategies/tool-contracts.ts:337-360`, `cli/tests/application/use-cases/framework/marketplace-build-strategy.codex.integration.test.ts:227-263`
- [x] The build integration suite fails if a native Codex marketplace `SKILL.md` contains `model`. — `cli/tests/application/use-cases/framework/marketplace-build-strategy.codex.integration.test.ts:227-243`, `cli/tests/fixtures/framework-codex/plugins/aidd-codex-fixture/skills/sample/SKILL.md:1-8`

### Phase 2 — Verify installed origin marketplace

- [x] The current-worktree Codex marketplace build and targeted integration tests succeed, and generated `SKILL.md` files have no `model` key. — `aidd_docs/tasks/2026_08/2026_08_03_codex-marketplace-skill-transform/validation.md:3-10`, `aidd_docs/tasks/2026_08/2026_08_03_codex-marketplace-skill-transform/validation.md:31-32`; `pnpm vitest run tests/application/use-cases/framework/marketplace-build-strategy.codex.integration.test.ts` => `30 passed`
- [x] An isolated Codex installation sourced from the local artifact has no `model` in installed `SKILL.md` and carries origin-specific marketplace identity. — `aidd_docs/tasks/2026_08/2026_08_03_codex-marketplace-skill-transform/validation.md:17-32` (`sourceType: local`, local artifact path, 13 installed `SKILL.md`, scan clean)

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| — | — | — | — | None. | — |

## Verification

| Metric | Value |
| --- | --- |
| Verified | 100% (4/4) |
| Files checked | `cli/src/application/use-cases/framework/strategies/marketplace-build-strategy.ts`, `cli/src/application/use-cases/framework/strategies/marketplace-strategy-helpers.ts`, `cli/src/application/use-cases/framework/strategies/tool-contracts.ts`, `cli/src/domain/tools/ai/codex.ts`, `cli/tests/application/use-cases/framework/marketplace-build-strategy.codex.integration.test.ts`, `cli/tests/fixtures/framework-codex/plugins/aidd-codex-fixture/skills/sample/SKILL.md`, `cli/tests/fixtures/framework-codex/plugins/aidd-codex-fixture/skills/sample/assets/template.md`, `aidd_docs/tasks/2026_08/2026_08_03_codex-marketplace-skill-transform/validation.md` |
| Unchecked | none |
| Unplanned | `aidd_docs/tasks/2026_08/2026_08_03_codex-marketplace-skill-transform/review.md` is the required review deliverable; none otherwise |
