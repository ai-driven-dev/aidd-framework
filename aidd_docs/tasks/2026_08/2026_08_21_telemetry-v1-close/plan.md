---
objective: "A person who turned measurement on can tell a real figure from an inert installation, on every tool this milestone claims."
status: done
---

# Plan: Close the measurement milestone

## Overview

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| **Goal**   | The milestone's remaining two issues close, and neither closes on hope |
| **Source** | Issues #681, #694, #617, epic #631                                     |

## Phases

| #   | Phase                                            | File                         |
| --- | ------------------------------------------------ | ---------------------------- |
| 1   | Copilot's own payload is the one we recognise    | [`phase-1.md`](./phase-1.md) |
| 2   | Each way the chain breaks is named as itself     | [`phase-2.md`](./phase-2.md) |
| 3   | The layer has met a hundred sessions             | [`phase-3.md`](./phase-3.md) |
| 4   | A real multi-step flow reconciles                | [`phase-4.md`](./phase-4.md) |

## Resources

| Source                                        | Verified                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A live Codex session, this branch             | The chain runs end to end on a second tool: hooks delivered, hooks fired, journal written, report reconciled. Claude Code is no longer the only one. |
| `~/.copilot/installed-plugins/…/hooks.json`   | The plugin installs for Copilot with `${PLUGIN_ROOT}` and its scripts intact. What is unproven is the payload its hook receives.                  |
| Two headless `cursor-agent -p` probes         | No plugin-scope Cursor hook fired at all. Cursor stays out of this milestone, as the epic already says.                                           |
| Issue #694, written against what now exists   | It restates #617's substance after coverage rather than before, so the diagnostic does not spend itself reporting failures already known.          |

## Decisions

| Decision                                                                 | Why                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every claim about a tool comes from that tool running, never from reading its bundle | #681 exists because a chain read from source looked airtight and was never confirmed against a payload. The same mistake twice would be a choice.                                                  |
| The diagnostic fails loudly rather than reporting a zero                  | A zero is what a healthy period looks like when nothing happened. The whole failure mode of this layer is a figure that looks right, so every question must have an answer that is neither ok nor a number.  |
| Cursor stays uncovered, and says so                                       | Its plugin hooks were not observed running, and the epic excludes it. Naming it uncovered is the true answer; implementing against an unmeasured tool would be the false one.                                |
| Load is measured and written down, not asserted                           | Everything shipped has met three sessions. A cap nobody has timed is a guess with a number on it.                                                                                                             |
