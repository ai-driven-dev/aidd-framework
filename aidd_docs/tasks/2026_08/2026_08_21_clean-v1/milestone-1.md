---
status: pending
---

# Milestone 1: Every declared tool records

Four hosts are declared. One of them actually journals.

## Why here

A tool that records nothing shows a user a zero, and a zero is the one thing this layer
exists never to show. That is worse than a tool whose figures lack a breakdown, and it is
cheaper to fix than anything in milestone 2.

## What it holds

| # | What | Unlocks | Effort |
| --- | --- | --- | --- |
| #681 | **The journal never writes on Copilot.** Declared, silent. | Copilot sessions gain a step and become reachable by the sweep | likely small, unknown until probed |
| #680 | **Cursor's turn-end never fires headless.** No step ever closes, so no interval exists. | Cursor's journal becomes usable the day its export opens | likely small |
| #693 | **A worktree gets its own journal, by accident.** Agent runners give each agent a worktree; this is the shape the field will actually present. | cross-worktree sessions stop reading as unattributed | a decision, then a line |
| #676 | **OpenCode joins through its plugin API, not hooks.** It is readable and unreachable: the sweep enumerates the journal, and no journal ever names an OpenCode session. | OpenCode gains a step *and* becomes reachable without naming a session by hand | a day, it is a different integration |

## Done when

- Each declared host writes `session_start`, `step_start` and `turn_end` in a live session — the same probe already run on Claude Code, run four more times.
- `journal_attributable` is true for every tool whose journal actually works, and the capability block says so.
- The per-tool table in `docs/telemetry-limits.md` matches what a live probe produces, not what was measured months ago.

## What stays uncovered, and is not a gap

Cursor's and Copilot's **token counts**. Cursor writes none on disk; Copilot's file carries
output tokens per turn and nothing per request. Only their own exports would close that,
and one is behind a setting a normal user cannot enable. Journalling them is worth doing
anyway: it makes their sessions attributable the day the figures arrive.
