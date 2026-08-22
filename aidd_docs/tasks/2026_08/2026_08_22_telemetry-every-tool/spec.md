---
status: draft
---

# Spec: measurement that works on every tool, proven on each

## The ask

Telemetry that works for all five tools, established by running them, not by reading their source.

## Why the answer cannot be "the same thing five times"

The tools do not offer the same surfaces, and a contract that pretends they do would be met by declaring success. What a consumer needs is the opposite: one output shape, and per tool an honest statement of which parts of it that tool can fill and which it cannot, each backed by a capture.

Two independent capabilities decide what a tool can supply, and they fail separately:

- **A tool can journal.** Its hooks run, they see a session identifier, and a step boundary can be recorded. This is what ties consumption to the work that caused it.
- **A tool can be read.** Something it writes carries token counts that can be joined to that session. This is what turns work into a figure.

A tool can have either, both, or neither. Claude Code has both. OpenCode has the second and not the first. Cursor has neither.

## What "works" means, per tool, testably

A tool is done when all four hold:

1. A real session on that tool leaves a run journal naming the session, its tool, and at least one step boundary.
2. Either a figure is produced for that session and reconciles to its breakdown exactly, or the tool declares precisely why no figure exists — and that declaration is backed by a capture, not by an argument.
3. The diagnostic, run inside a session on that tool, answers every claim without reading `--` for a reason that is "nobody measured".
4. Nothing about the tool is asserted anywhere in the repository that a capture does not support.

## State today, measured

| Tool | Journals | Readable into a figure | What stands in the way |
| --- | --- | --- | --- |
| Claude Code | yes, proven on a live three-skill chain | yes, reconciles exactly | nothing |
| Codex | yes, proven on a live session | yes | it silently declines to run a hook it was never asked to trust |
| Copilot | its payload is recognised, as of a real capture | no per-request input figure exists in its own files | a skill call opens no step, so every record reads unattributed |
| Cursor | no plugin-scope hook was observed firing at all | it writes no token count in any file | both, and the first blocks the second from mattering |
| OpenCode | nothing establishes that anything sees its own session id | yes, but the figures cannot be joined to a session | the join |

## Done when

- Each of the five tools satisfies the four conditions above, or its failure to is a measured statement in the repository rather than a gap.
- Every claim about a tool in code, tests or documentation cites the capture behind it.
- One branch carries the work, and every issue it closes says what closed it.

## Explicitly not this

Aggregation across people or teams, the upload path, and the commit trailer. They belong to the milestone after and none of them is blocked by this.
