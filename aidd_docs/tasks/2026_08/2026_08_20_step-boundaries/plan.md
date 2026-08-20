---
objective: "A session on Claude Code, Copilot, Codex or Cursor leaves a journal line naming each skill that started, ordered precisely enough to join to the cost the same session exported."
status: pending
---

# Plan: Step boundaries

## Overview

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| **Goal**   | Record which step was running, as an observed fact, on four tools     |
| **Source** | [`spec.md`](./spec.md), issue #663 and its 2026-08-20 measurement     |

## Phases

| #   | Phase                          | File                         |
| --- | ------------------------------ | ---------------------------- |
| 1   | The journal serves four hosts  | [`phase-1.md`](./phase-1.md) |
| 2   | A started step is a fact       | [`phase-2.md`](./phase-2.md) |
| 3   | The sink carries the order     | [`phase-3.md`](./phase-3.md) |

## Resources

| Source                                                        | Verified                                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| github.com/ai-driven-dev/framework/issues/663#issuecomment-5351626566 | What each of the five tools exposes, one probe per tool. No tool exposes the end of a skill's work.                        |
| github.com/ai-driven-dev/framework/issues/680                 | Cursor's turn-end hook does not fire headless; `sessionEnd` arrives instead and is unmapped. Bounds what phase 1 can deliver there. |
| github.com/ai-driven-dev/framework/issues/681                 | A captured Copilot payload carries `sessionId` and no `hook_event_name`, which is exactly what host detection wants - but that probe declared canonical camelCase events while the framework declares PascalCase, which switches Copilot to a different payload shape. The defect is neither confirmed nor refuted, and the likely fix is one declaration. |
| github.com/ai-driven-dev/framework/issues/682                 | OpenCode needs a plugin artifact, not a hook. Out of scope here.                                                                    |
| Captured hook payloads, four hosts, under the probe scratchpad | The exact shape each host delivers. Every extractor in phase 2 is written against a payload the tool actually sent, not a schema.  |

## Decisions

| Decision                                                                                     | Why                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The journal writes only a step's start; the interval is the reader's derivation                | No tool exposes when a skill's work ends. Writing a derived end would store a conclusion as a fact, which the journal's shape exists to prevent.                                                  |
| One host table, two extractor families, never a branch on a tool name                          | Three hosts carry the skill name in a tool argument, two derive it from a `SKILL.md` path. Two implementations cover four tools, and a fifth tool is a table entry rather than an edit to logic.   |
| The path-family extractor scans every string in the tool payload rather than one named field   | Cursor puts the path in `tool_input.file_path`, Codex inside `tool_input.command`. The capture also showed Codex's hook names that tool `Bash`, not the `exec_command` its own transcripts record, so an extractor keyed on a tool name would have failed silently. Scanning does not care. |
| The per-tool declaration on the CLI side is deferred to #629                                   | Nothing in this ticket reads it. Adding a declaration with no consumer is the stub the clean-code rule forbids. Only the ordering attribute lands here, because the sink must capture it as it arrives. |
| Ordering is the export's own sequence number, with the timestamp as fallback                   | Measured: two records one sequence apart share a millisecond, so a timestamp alone cannot order a session.                                                                                        |
| On Claude Code the step joins to cost by turn identifier, not by order                         | The captured `Skill` payload carries `prompt_id`, the same value the sink already stores as the turn key. Where that holds the join is exact and needs no ordering at all; ordering is the fallback for hosts without it. |
