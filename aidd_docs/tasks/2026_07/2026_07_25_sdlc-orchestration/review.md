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

- [x] Enter Frame with `$source` only and resolve a referenced ticket as part of that source — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:5`
- [x] Send a planning-ready source directly to Deliver without mandatory framing work — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:36`
- [x] Call canonical brainstorm and spec providers only for the missing behavior they own — `plugins/aidd-orchestrator/skills/01-sdlc/references/01-frame.md:37`

### Phase 3 — Deliver the candidate

- [x] Produce a proportional plan autonomously and delegate it to one `@aidd-dev:executor` — `plugins/aidd-dev/skills/01-plan/actions/04-plan.md:19`
- [x] Let implementation and assertion skills own their validation and repair loops — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:5`
- [x] Include architecture conformance through `/aidd-dev:03-assert` when architecture is documented — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:5`
- [x] Run the required E2E journey last and return a failure to the executor — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:44`
- [x] Commit and push validated work through `/aidd-vcs:01-commit` before Check — `plugins/aidd-orchestrator/skills/01-sdlc/references/02-deliver.md:7`

### Phase 4 — Check independently

- [x] Give one fresh checker the contract, plan, committed candidate, and validation reports — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:44`
- [x] Run `/aidd-dev:05-review`, then `/aidd-refine:02-challenge` in the same independent context — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:48`
- [x] Keep pride, confidence, and end-to-end satisfaction gates inside the challenge skill — `plugins/aidd-refine/skills/02-challenge/actions/01-challenge.md:18`
- [x] Use product and contract findings as the next Frame source — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:54`
- [x] Parallelize independent implementation findings through Todo and keep dependent repairs together — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:55`
- [x] Re-enter Check after every repaired candidate and open the draft PR only without actionable findings — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:7`
- [x] Declare every checker capability with its canonical slash address — `plugins/aidd-dev/agents/checker.md:44`

### Phase 5 — Keep the protocol autonomous and readable

- [x] Make autonomy the default and define the narrow conditions that still require user authority — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:10`
- [x] Keep the top-level router to Frame, Deliver, and Check without representing the already-invoked SDLC as a node — `plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md:36`
- [x] State the expected behavior before each routing diagram — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:3`
- [x] Keep all four diagrams top-down, grouped by stage, and visually distinguish skills, agents, artifacts, and zones — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:13`
- [x] Keep orchestration protocols in references rather than restoring an executable action tree — `docs/ARCHITECTURE.md:144`
- [x] Document orchestrator-authorized bounded Todo fan-out without permitting agent delegation chains — `docs/ARCHITECTURE.md:155`
- [x] Resolve every canonical provider and agent address used by the SDLC protocol — `plugins/aidd-orchestrator/skills/01-sdlc/references/03-check.md:65`

## Findings

None.

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (24/24) |
| Files checked | All 35 changed files in `origin/next...working-tree`; four SDLC Mermaid diagrams rendered; five flat distributions built |
| Unchecked     | none |
| Unplanned     | none |
