# Review: SDLC orchestration migration

- **Verdict**: approve
- **Diff**: `origin/next...working-tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_25
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Move orchestration

- [x] Register `01-sdlc` in `aidd-orchestrator` — `plugins/aidd-orchestrator/.claude-plugin/plugin.json:10`
- [x] Remove the former SDLC skill and its action tree from `aidd-dev` — `git diff --name-status origin/next`

### Phase 2 — Frame the contract

- [x] Retrieve an attached ticket before evaluating readiness — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:27`
- [x] Skip specification when the source already has an objective and observable acceptance criteria — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:32`
- [x] Use canonical brainstorm and spec providers only when framing is required — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:34`

### Phase 3 — Deliver the candidate

- [x] Keep planning in the orchestrator and implementation in `@aidd-dev:executor` — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:43`
- [x] Route failed coding assertions back through delivery — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:51`
- [x] Run architecture assertions through `/aidd-dev:03-assert` when architecture documentation applies — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:53`
- [x] Commit the validated candidate through `/aidd-vcs:01-commit` — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:58`
- [x] Run the required E2E journey last and reject a failing journey — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:61`

### Phase 4 — Check independently

- [x] Give a fresh checker the contract, plan, candidate SHA, and validation reports — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:52`
- [x] Run `/aidd-dev:05-review` independently from implementation — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:56`
- [x] Challenge the reviewed outcome in a second fresh checker context — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:61`
- [x] Gate completion on pride, confidence, and end-to-end user satisfaction — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:64`
- [x] Route contract gaps to Frame and independent implementation findings through Todo executors — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:67`
- [x] Verify the reviewed SHA before opening the draft pull request — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:77`

### Phase 5 — Keep the protocol autonomous and readable

- [x] Make autonomy the default and define the narrow conditions that still require user authority — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:56`
- [x] Continue until validation, independent review, challenge, clean branch, and draft PR gates all hold — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:59`
- [x] Keep all four diagrams LR, grouped by stage, and visually distinguish skills, agents, artifacts, decisions, and zones — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:9`
- [x] Document orchestrator-authorized bounded Todo fan-out without permitting agent delegation chains — `docs/ARCHITECTURE.md:155`
- [x] Describe specification as conditional and expose the challenge gate in public documentation — `README.md:37`

## Findings

None.

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (21/21) |
| Files checked | All 31 changed files in `origin/next...working-tree`; four Mermaid diagrams rendered; five flat distributions built |
| Unchecked     | none |
| Unplanned     | none |
