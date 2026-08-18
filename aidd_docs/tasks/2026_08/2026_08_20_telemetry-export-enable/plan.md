---
objective: "One AIDD switch the whole framework obeys, and one per-tool activation behind it."
status: pending
type: plan
---

# Plan: turning telemetry on

## Overview

| Field | Value |
| --- | --- |
| **Goal** | AIDD measures only when AIDD was told to, on whichever tool the project uses |
| **Specification** | `ai-driven-dev/framework#646` |
| **Depends on** | #620, done — the journal this gives something to join against |
| **Unblocks** | #647 the sink, #617 the diagnostic, #629 the report |

## Two questions, and only one of them is about Claude Code

An earlier version of this plan answered one question — how to write an `env`
block into a Claude Code settings file — and called it the feature. That was the
smaller half, and it made the plan Claude-shaped when the framework is not.

**Is AIDD allowed to measure this project at all?** One switch, one answer, read
by every component: the journal hook, the sink, the diagnostic, the report. It is
independent of whether the tool is exporting telemetry, because a tool may be
exporting for reasons that have nothing to do with us — an organisation's own
collector, an unrelated setting, a default nobody chose. **AIDD not helping
itself to data it was not given is the guarantee**, and it cannot be delegated to
a provider's setting.

**How is each tool made to emit?** Differently everywhere, and for one of them,
not at all by us.

## What each tool actually needs, measured

| Tool | Where the export is turned on | Who can turn it on |
| --- | --- | --- |
| Claude Code | `env` block in `settings.json` | the CLI |
| Codex | `[otel]` in `config.toml` | the CLI — **and it must set `metrics_exporter`, which defaults to `statsig`, a third party nobody chose** |
| OpenCode | `experimental.openTelemetry` in `opencode.json` | the CLI |
| GitHub Copilot | `COPILOT_OTEL_ENABLED`, an environment variable | nobody writes a file for this; the CLI can only instruct |
| Cursor | a team setting, Enterprise plan, in beta | **nobody.** The framework can check it, never set it |

So "one command turns the export on" is true for three tools, partial for a
fourth, and false for the fifth. A plan that does not say which is which will be
discovered to be Claude-only by whoever tries the second tool.

## Who does what

| Concern | Owner | Why |
| --- | --- | --- |
| The switch | a file both sides read | a hook cannot run the CLI, and the CLI cannot be present in a session |
| Writing a tool's config | the CLI | it already tracks what it wrote, per tool, and already removes exactly that |
| Reading state and explaining it | a skill | #617; it belongs where the user is asking |
| Obeying the switch | everything | the journal hook first, since it is the one already shipping |

**The CLI does not need a new writer.** `.aidd/manifest.json` already records
`mergeFiles` — which file, which section, which entries — per tool, and
`clean-use-case.ts` already removes exactly those through `removeEntriesFromJson`.
Enabling a tool's export is one more merge entry in machinery that exists and is
already exercised by `aidd clean`. Writing a second one would give the repository
two ways to edit the same file, and only one of them undoable.

## Phases

| # | Phase | Ends when |
| --- | --- | --- |
| 1 | [The switch](./phase-1.md) | the journal refuses to write when AIDD telemetry is off, whatever the tool is doing |
| 2 | [What Claude Code needs](./phase-2.md) | one tool emits, through the existing manifest machinery |
| 3 | [The command](./phase-3.md) | `aidd telemetry on\|off`, naming its file and guarding the shared scope |
| 4 | [The journeys](./phase-4.md) | an e2e test covers on, on-again, off, and proves where it wrote |

Phase 1 comes first because it is the guarantee. A tool made to emit before the
switch exists is a tool exporting data with nothing empowered to stop it.

## Standing rules

- **The switch is checked at the point of use, never cached.** Something turned
  off must stop mattering immediately, not next session.
- **Say the file before writing it**, on every scope, every run.
- **Never touch a key we did not add.** Enable is an upsert of a known set;
  disable removes exactly that set, through the manifest that recorded it.
- **Nothing is enabled by installing.** The plugin ships hooks; turning an export
  on is always an explicit gesture.
- **Never claim a tool is covered when it is not.** Cursor cannot be enabled by
  us, and saying so is part of the deliverable.

## Resources

- #646, the specification, plus its comment thread for the decisions already closed.
- `cli/src/application/use-cases/clean-use-case.ts` and `.aidd/manifest.json`'s
  `mergeFiles` — the write-and-undo machinery to extend, not duplicate.
- `cli/src/application/use-cases/marketplace/marketplace-sync-settings-use-case.ts` —
  the surgical-upsert precedent.
- #653 for the four other tools' export switches, and #676 for OpenCode's plugin API.
- [Claude Code settings](https://code.claude.com/docs/en/settings).
