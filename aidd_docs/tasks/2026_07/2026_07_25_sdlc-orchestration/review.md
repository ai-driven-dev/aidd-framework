# Review: SDLC orchestration migration

- **Verdict**: changes-requested
- **Diff**: `origin/next...working-tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_25
- **Findings**: 0 critical, 6 warning, 1 minor

## Phases

### Phase 1 — Move orchestration

- [x] Register `01-sdlc` in `aidd-orchestrator` — `plugins/aidd-orchestrator/.claude-plugin/plugin.json:10`
- [x] Remove the former SDLC action tree from `aidd-dev` — `git diff --name-status origin/next`

### Phase 2 — Frame the contract

- [x] Skip specification when the source already has an objective and acceptance criteria — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:30`
- [x] Use the canonical brainstorm and spec providers when framing is required — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:18`

### Phase 3 — Deliver the candidate

- [x] Order plan, implementation, assertions, architecture check, commit, and final E2E — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:31`
- [ ] Route failed assertions and failed E2E back to implementation — every report currently advances toward `$candidate_sha`

### Phase 4 — Check independently

- [x] Run review in `@aidd-dev:checker` and fan independent fixes through Todo — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:26`
- [ ] Give the checker the contract and plan — only `$candidate_sha` enters the checker
- [ ] Verify the reviewed SHA before opening the pull request — the ship edge opens it directly
- [ ] Keep agent spawning inside the orchestrator boundary — Todo currently points directly to executor agents

### Phase 5 — Keep the protocol readable

- [x] Use `flowchart LR` and distinct classes for skills, agents, artifacts, decisions, and zones — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:9`
- [ ] Keep the delivery diagram readable in a normal Markdown viewport — the rendered LR graph is an approximately 5,200 px single row
- [ ] Describe specification as conditional in the public quick start — the current summary still shows `spec` as mandatory

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 warning | functional | 3 | `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:39` | `$assert_report`, `$architecture_report`, and `$journey_report` have only success-shaped forward edges, so failed validation reaches `$candidate_sha` despite the stated gate. | Add explicit pass decisions after each report and route failure back to `@aidd-dev:executor`; only green reports may advance. |
| 🟡 warning | functional | 4 | `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:26` | The checker receives only `$candidate_sha`; `/aidd-dev:05-review` cannot perform its functional axis without the contract and plan. | Feed `$contract`, `$plan`, and `$candidate_sha` into `@aidd-dev:checker`. |
| 🟡 warning | functional | 4 | `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:39` | The ship branch calls `/aidd-vcs:02-pull-request` directly, while line 59 requires verifying that the reviewed SHA is current. | Add a reviewed-SHA decision before the pull-request skill and route stale work back through delivery and review. |
| 🟡 warning | conform | 4 | `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:32` | `/aidd-dev:10-todo` directly fans out executor agents, conflicting with `docs/ARCHITECTURE.md:155`, which reserves spawning for a high-level orchestrator. | Make `/aidd-orchestrator:01-sdlc` own the fan-out after Todo splits the findings, or document and place Todo as an orchestration capability. |
| 🟡 warning | functional | 5 | `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:9` | Pure LR layout produces an ultra-wide strip that still requires heavy horizontal scrolling, missing the readability goal. | Keep the outer flow LR but group delivery stages into compact subgraphs with local vertical layout. |
| 🟡 warning | fit | 5 | `README.md:37` | The public flow says `spec → plan`, contradicting the new conditional framing contract. | Replace mandatory `spec` with `frame` or mark specification as conditional. |
| 🟢 minor | rot | - | `scripts/sync-skill-argument-hints.mjs:98` | A formatting-only rewrite is unrelated to the SDLC migration. | Revert the unrelated formatting change or isolate it in a separate commit. |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 54% (7/13) |
| Files checked | All 30 changed files in `origin/next...working-tree`; four SDLC Mermaid diagrams rendered |
| Unchecked     | Validation failure loops — fix; checker inputs — fix; reviewed SHA gate — fix; Todo spawning boundary — fix; LR readability — fix; conditional framing in README — fix |
| Unplanned     | Formatting-only change in `scripts/sync-skill-argument-hints.mjs` |
