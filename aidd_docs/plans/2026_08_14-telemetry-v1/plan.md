---
objective: "Sequence the telemetry work across three milestones; the issues hold the content."
status: pending
type: plan
---

# Plan: telemetry, three milestones

## Overview

| Field | Value |
| --- | --- |
| **Goal** | Sequence the work. The issues, not this file, hold what to build |
| **Source** | Milestones 14, 15 and 16 on `ai-driven-dev/framework` |
| **Design** | `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` |
| **Evidence** | `aidd_docs/brainstorm/2026_08_13-telemetry-layer.md` |

This file deliberately carries no design. An earlier version described the hooks' owning plugin, the way a task is resolved, the CLI surface and the join — and every one of those four claims was falsified by measurement within two days, while remaining readable as instructions. A plan that restates its issues drifts from them silently, and the drift is invisible until someone builds the wrong thing.

What follows is only the order, and why.

## Milestone 14 — one figure, on one tool

| Issue | Type | Role |
| --- | --- | --- |
| #632 | Spike, closed | the measurement campaign that grounds everything below |
| #618 | Bug | per-tool facts, corrected and dated |
| #620 | Task | the `aidd-telemetry` plugin and its run journal |
| #646 | Feature | the one CLI gesture: turn the provider export on |
| #647 | Task | a readable sink, since no file exporter exists |
| #617 | Feature | the skill that proves the pipe flows |
| #629 | Feature | the skill that reports the figure |

Parallel: #618 and #650 depend on nothing. #620, #646 and #647 can proceed together once the endpoint contract between #646 and #647 is fixed. #617 and #629 follow.

## Milestone 15 — the board sees the whole feature

#648 epic, with #649 task identity, #650 artefact types, #651 the board reading execution.

#650 blocks nothing and unblocks #651; pulling it into milestone 14 costs nothing.

## Milestone 16 — aggregate across tools and people

#652 epic, with #653 the four remaining tools, #654 the price table, #655 upload-path redaction, #656 per-person reporting, #630 the commit trailer.

This milestone cannot start before the anonymity decision is settled. #297 recorded anonymised identifiers as a decision of record; per-person reporting reverses it. That reversal is an organisational call, not an engineering one.

## Decisions that belong here rather than to any single issue

- **Claude Code first and alone**, through milestone 14. The mechanics are identical elsewhere; only the export configuration and the gate differ. Widening before proving multiplies the causes of failure.
- **Do not wait on #585.** `.aidd/config.yml` exists in no code and the CLI uses no YAML parser. The one key needed fits the JSON already read from `.aidd/`. When #585 lands, that is a line of reading to move.
- **The plugin carries the hooks; the CLI carries one gesture.** A plugin's `settings.json` accepts only `agent` and `subagentStatusLine`, and unknown keys are silently ignored, so a plugin cannot switch a provider export on. Everything else that reads belongs to skills.

## Resources

- The issues above, which are the specification.
- `plugins/aidd-context/hooks/` — the proven bundled-hook pattern.
- `cli/src/application/commands/` — where the one CLI gesture lands.
- The probes from the measurement campaign, reusable as acceptance tests.
