---
objective: "Every tool either measures, or states what it cannot measure and why — each backed by a session that was actually run."
status: pending
---

# Plan: measurement on every tool

## Overview

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| **Goal**   | The measurement layer covers five tools, proven one by one    |
| **Source** | [`spec.md`](./spec.md), issues #676 #680 #681 #697 #699 #701  |

## Phases

| #   | Phase                                                  | File                         |
| --- | ------------------------------------------------------ | ---------------------------- |
| 1   | A script runs from the tree an install actually carries | [`phase-1.md`](./phase-1.md) |
| 2   | Codex says when it is holding a hook back               | [`phase-2.md`](./phase-2.md) |
| 3   | A Copilot session names the step it is in               | [`phase-3.md`](./phase-3.md) |
| 4   | Cursor either runs a plugin hook, or is known not to    | [`phase-4.md`](./phase-4.md) |
| 5   | OpenCode's own session id reaches the journal           | [`phase-5.md`](./phase-5.md) |

Ordered by what each one unblocks, not by difficulty. Phase 1 is first because it is the guard that would have caught the last two defects, and every later phase adds a script it should cover. Phases 2 to 5 are independent of each other.

## Resources

| Source | Verified |
| --- | --- |
| A live Claude Code chain, three skills | Journals, reconciles exactly, diagnostic agrees. The reference the others are held against. |
| A live Codex session | Journals and reconciles. Its hooks are skipped in silence until trusted. |
| A real `@github/copilot@1.0.80` capture | Three hooks fire; the payload is the `_vsCodeCompat` shape, now recognised. Its skill calls still open no step. |
| Two headless `cursor-agent -p` probes | No plugin-scope hook fired at all, while a project-scope file fired five of seven events in an earlier probe. |
| A copied plugin tree with no `hooks/` | A script requiring across that boundary dies at load. 310 tests passed over it; only running from the copy caught it. |

## Decisions

| Decision | Why |
| --- | --- |
| A tool is proven by a session that ran, never by its source | Every tool in this layer has been wrong about itself once. Copilot's chain read airtight from its bundle and was one field name off; Codex's token was declared correctly and never checked. Reading is how the last two defects got written. |
| "Cannot be measured" is a result, with a capture behind it | Four of five tools will not reach the same coverage, and pretending otherwise is met by declaring success. A stated limit a consumer can act on is worth more than a figure they cannot trust. |
| A tool's own vocabulary is translated at the edge, never adopted inward | Each tool spells session, step and moment differently. The readers already collapse those into one shape; new tools join by extending that translation, not by leaking a fifth spelling into the report. |
| No phase closes on a green suite alone | 310 specs passed over a script that could not load on one of the five tools. The suite runs from the source tree; installs do not. |
