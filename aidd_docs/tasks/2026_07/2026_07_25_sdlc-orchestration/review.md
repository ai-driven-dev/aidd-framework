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
- [x] Attach the orchestrator skill branch to the declared plugin node in the codebase map — `aidd_docs/memory/codebase-map.md:23`

### Phase 2 — Frame the contract

- [x] Retrieve an attached ticket before evaluating readiness — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:29`
- [x] Skip specification when the source already has an objective and observable acceptance criteria — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:34`
- [x] Use canonical brainstorm and spec providers only when framing is required — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:36`

### Phase 3 — Deliver the candidate

- [x] Produce a self-contained human-readable plan and delegate implementation to `@aidd-dev:executor` — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:5`
- [x] Route failed coding assertions back through delivery — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:55`
- [x] Run architecture assertions through `/aidd-dev:03-assert` when architecture documentation applies — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:57`
- [x] Commit the validated candidate through `/aidd-vcs:01-commit` — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:62`
- [x] Run the required E2E journey last and reject a failing journey — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:65`

### Phase 4 — Check independently

- [x] Give a fresh checker the contract, plan, committed candidate, and validation reports — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:56`
- [x] Run `/aidd-dev:05-review` independently from implementation — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:60`
- [x] Challenge the reviewed outcome in a second fresh checker context — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:65`
- [x] Gate completion on pride, confidence, and end-to-end user satisfaction — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:68`
- [x] Route contract gaps to Frame and parallelize independent implementation findings through Todo executors — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:71`
- [x] Review the candidate again when it changed before opening the draft pull request — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:81`
- [x] Declare every checker capability with its canonical slash address — `plugins/aidd-dev/agents/checker.md:44`

### Phase 5 — Keep the protocol autonomous and readable

- [x] Make autonomy the default and define the narrow conditions that still require user authority — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:10`
- [x] Continue until validation, independent review, challenge, clean branch, and draft PR gates all hold — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:12`
- [x] State behavioral invariants before each diagram without repeating the routing below it — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:3`
- [x] Keep all four diagrams top-down, grouped by stage, and visually distinguish skills, agents, artifacts, decisions, and zones — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:13`
- [x] Document orchestrator-authorized bounded Todo fan-out without permitting agent delegation chains — `docs/ARCHITECTURE.md:155`
- [x] Describe specification as conditional and expose the challenge gate in public documentation — `README.md:37`

## Findings

None.

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (24/24) |
| Files checked | All 32 changed files in `origin/next...working-tree`; five Mermaid diagrams rendered; five flat distributions built |
| Unchecked     | none |
| Unplanned     | none |
