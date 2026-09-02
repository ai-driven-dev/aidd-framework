---
objective: "A period breaks down by the orchestrated run that produced it, derived from the journal as it stands, and every line names the version that wrote it."
status: pending
---

# Plan: the flow, and who wrote what

## Overview

| Field      | Value                                                             |
| ---------- | -------------------------------------------------------------------- |
| **Goal**   | An axis with no new capture, and one version per producer            |
| **Source** | [`spec.md`](./spec.md)                                               |

## Phases

| #   | Phase                                     | File                         |
| --- | ----------------------------------------- | ---------------------------- |
| 1   | The flow, read from what is already there  | [`phase-1.md`](./phase-1.md) |
| 2   | Each producer stamps its own version       | [`phase-2.md`](./phase-2.md) |

The two are independent. If one stalls, the other lands.

## Decisions

| Decision                                                                              | Why                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A flow is derived, not declared                                                          | Skill detection is generic (`skill-detection.cjs:10` matches any `skills/<name>/SKILL.md`), so an orchestrating skill already produces a step and the sequence is in the journal. A declaration would add a capture for a fact already recorded — the speculative shape this branch has paid for twice. |
| Which skills orchestrate is declared in one place, never matched from a plugin string     | No skill's frontmatter says it orchestrates, and `aidd-orchestrator` holds three that plausibly do. Matching a plugin name in passing is precisely the tool-name branching this repository already carries as a debt (#683). One declared list is reviewable and a project can extend it. |
| The limit is stated rather than engineered away                                           | A skill a person runs by hand during a flow counts inside it; the journal cannot tell it from one the orchestrator invoked. Saying so where the figure is read is cheaper and truer than a mechanism that guesses.                        |
| Each producer stamps only what it writes                                                  | The plugin's hook writes the journal; the CLI writes the stored record. Putting the framework's version on a record would name something that wrote neither, and putting the CLI's version on a journal line would name something that was not running. |
| An older line reads as unknown, never as a version                                        | A line written before this change has no version, and inventing one would make an upgrade comparison silently wrong in the one place it matters.                                                                                          |

## Resources

| Source                                            | Verified                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `hooks/lib/tools/skill-detection.cjs:10`          | `/(?:^\|\/)skills\/([^/]+)\/SKILL\.md(?:["'\s]\|$)/u` — generic, not a whitelist       |
| `plugins/aidd-orchestrator/skills/`               | `00-async-dev`, `01-sdlc`, `02-backlog`; no frontmatter key says any of them orchestrates |
| `.release-please-manifest.json`                   | framework `5.9.0`, `plugins/aidd-telemetry` `0.1.0`, `cli` `5.2.2` — three, not one     |
| `plugins/aidd-telemetry/.claude-plugin/plugin.json` | declares `"version": "0.1.0"`; the hook sits one directory away and does not read it     |
| `cli/src/infrastructure/adapters/current-version-adapter.ts` | the CLI already reads its own version through a port                                    |
