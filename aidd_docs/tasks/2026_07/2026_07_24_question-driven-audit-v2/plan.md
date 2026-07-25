---
objective: "The audit capability uses independently spawned checker agents to find the highest-leverage divergences between current code, North Stars, active rules, and memory, then publishes one maintainable folder of numbered Markdown reports."
status: in-progress
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: Question-driven audit V2

## Overview

| Field      | Value                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| **Goal**   | Produce a static-first 80/20 audit of current code and normative truth, with small independently owned Markdown shards. |
| **Source** | User conversation on 2026-07-24, including two supplied X posts about knowledge-as-infrastructure and auditing AI-made choices. |

## Phases

| #   | Phase                            | File                         |
| --- | -------------------------------- | ---------------------------- |
| 1   | Agree the V2 contract            | [`phase-1.md`](./phase-1.md) |
| 2   | Rebuild the audit recipe         | [`phase-2.md`](./phase-2.md) |
| 3   | Orchestrate audit checkers        | [`phase-3.md`](./phase-3.md) |
| 4   | Prove behavior and publish       | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision                                                                                              | Why                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Questions generate hypotheses; only verified hypotheses become findings                              | Model self-critique is useful for discovery but is not evidence and can confidently invent intent, history, or causality. |
| Audit declared and reconstructed choices before implementation details                               | Choice review compresses the search, but undeclared choices and implementation drift still require targeted evidence.     |
| Record choice provenance as `specified`, `agent-made`, or `retrospectively-inferred`                  | A post-hoc model account must not be presented as reliable implementation history.                                        |
| Prefer an implementation-time decision log, but accept labelled retrospective reconstruction         | Choices are most reliable while their context is alive; existing systems still need an honest fallback.                  |
| Turn recurring findings into knowledge-infrastructure candidates                                     | A one-off fix spends reasoning again; types, lint, CI, tests, rules, skills, memory, or docs can prevent the whole class.  |
| Ignore historical task documentation by default; scan only current code, North Stars, active rules, memory, and declared current architecture | Old plans are implementation history, not present-tense truth, and their drift is expected.                    |
| Discover the target and normative sources at audit runtime                                             | Repository paths, North Stars, rules, and memory are project inputs; hard-coding them would make the skill non-portable.  |
| Cap each pillar at five high-impact findings and omit cosmetic nits                                   | The audit optimises for leverage and decision quality, not exhaustive defect inventory.                                   |
| Keep audit methodology in `aidd-dev`; put agent fan-out and synthesis in `aidd-orchestrator`          | Project architecture assigns domain recipes to their concern and spawning to the coordination layer.                     |
| Make question packs configurable from project principles instead of hard-coding only universal axes  | AIDD rules, golden principles, product constraints, and dashboard-specific risks differ by project.                      |
| Give each audit checker an exclusive report shard; only the synthesizer writes the merged report      | Parallel agents must not race on one file or silently overwrite another agent's evidence.                                |
| Publish `00-summary.md` plus stable `01` to `14` Markdown files in one audit folder                     | Nine core pillars plus challenge and synthesis stay compact, refreshable, and deterministically exportable.               |
| Spawn the existing `checker` with the audit recipe instead of adding an `auditor` role                 | The skill owns audit expertise; the agent adds isolation, and `checker` already permits invoking the audit capability.    |
| Add an adversarial challenge pass between investigation and synthesis                                 | Duplicate, speculative, and contradictory findings need independent rejection before ranking.                           |
| Report confidence, evidence kind, impact, likelihood, and reach separately                            | One severity label cannot compare a likely local smell with a rare systemic failure or an unverified concern.            |
| Preserve explicit unknowns and disagreements instead of forcing a verdict                             | “I do not know” is a valid audit result when history, runtime access, telemetry, or a normative source is missing.        |
| Degrade visibly to serial execution when the host cannot spawn agents                                 | Portability matters, but a single-agent run must never be presented as independent parallel review.                      |
| Default to static inspection; permit only a targeted runtime check for an otherwise unresolvable critical suspicion | A broad E2E pass is expensive, noisy, and outside the desired audit behavior.                                    |
