---
objective: "Build the run journal: every session leaves a durable record tying it to a task, and never a measurement."
status: pending
type: plan
---

# Plan: the run journal

## Overview

| Field | Value |
| --- | --- |
| **Goal** | A plugin whose hooks journal every session, one file per session |
| **Specification** | `ai-driven-dev/framework#620` |
| **Design** | `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` |
| **Evidence** | `aidd_docs/brainstorm/2026_08_13-telemetry-layer.md` |

An earlier version of this file indexed three milestones and their issues. That
index is gone. This repository's GitHub issues **are** its backlog, and
`persistence.md` is explicit — "Never mirror one Story across supports". A plan
that restates its issues creates a second truth that drifts silently, which is
what already happened once here: four load-bearing claims were falsified by
measurement in two days while remaining readable as instructions.

So this file plans the building. What to build lives in #620, once.

## What is proven, and what it forces

Both were measured on 2026-08-16, because both were premises the plan would have
rested on.

**Installing the plugin activates its hooks.** No `plugin.json` in this
repository declares a `hooks` key, so the mechanism might have reached users only
through `aidd framework build` — in which case "do not install it" is not the
opt-out and the CLI does wire per tool. Probed with the local marketplace under
an isolated `CLAUDE_CONFIG_DIR`: after installing `aidd-context`, one session
filled the `<aidd_project_memory>` block. Discovery is by convention.

The same probe gave the acceptance method for everything below: **the hook fired
on a session that ended `Not logged in`.** Session start is minted client-side,
so verifying the journal consumes nothing.

**The host cannot be read from field names, and must not be read from the
environment.** Claude Code and Codex hand a `SessionStart` hook the same five
keys — `session_id`, `transcript_path`, `cwd`, `source`, `hook_event_name`.
Environment is actively wrong: a Codex session launched from inside a Claude Code
session inherits `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PID` from its
parent, and nesting is the normal case in this project.

This is why phase 2 exists as its own phase. Host detection is not a line inside
the write path; it is the thing most likely to be silently wrong, so it is built
and proven before anything is written.

## Phases

| # | Phase | Ends when |
| --- | --- | --- |
| 1 | [Plugin shell and test runner](./phase-1.md) | the plugin installs, does nothing, and `node --test` runs in `lefthook` |
| 2 | [Host gate](./phase-2.md) | four recorded payloads replay, one is recognised, three exit 0 |
| 3 | [Opt-in and location](./phase-3.md) | a session writes one file outside the repository, only when opted in |
| 4 | [The record](./phase-4.md) | that file carries exactly the ten keys, refreshed each turn |
| 5 | [Attachment](./phase-5.md) | a session that switches task produces two intervals |
| 6 | [Materialisation at commit](./phase-6.md) | **confirm the owner first** — see below |

Phases 1 to 5 are reversible: everything they write lives outside the repository
and can be deleted without trace. Phase 6 is not.

## The decision phase 6 waits on

Session records live outside the repository and are materialised into
`aidd_docs/runs/` at commit. The plugin cannot own that step — its hooks only see
sessions, and a commit can be made by a human with none running. Only git knows a
commit happened, so the trigger is a git `post-commit` hook installed by the CLI
gesture of #646.

It is also the only step that puts who-worked-on-what-and-for-how-long into
permanent git history, which #652 says cannot ship without an organisational
decision. Confirm the owner before building it; build phases 1 to 5 regardless.

## Standing rules for every phase

- **Exit 0 on every failure path.** A measurement layer that breaks a session is
  worse than one that misses a session.
- **No token, cost, model or duration in any file.** Those change mid-session and
  come from telemetry; the journal only makes them joinable.
- **One writer per file.** One file per session is what makes parallel worktrees
  conflict-free, and it is not an optimisation to revisit.
- **Tests live in `scripts/__tests__/`.** The build copies `hooks/` recursively
  into every user project, so a test folder inside the plugin ships to them —
  `docs/ARCHITECTURE.md` states this.

## Resources

- #620, the specification. Its comment thread carries the closed decisions.
- `plugins/aidd-context/hooks/` — the proven bundled-hook pattern, and what the
  activation probe exercised.
- `cli/.../framework/strategies/tool-contracts.ts`, `hooksBundle` — copies
  `hooks/` into all five tool targets with no exclusion mechanism. This is why
  the plugin must be separate rather than a folder in an existing one.
- The recorded hook payloads, one per host, reused as fixtures in phase 2.
