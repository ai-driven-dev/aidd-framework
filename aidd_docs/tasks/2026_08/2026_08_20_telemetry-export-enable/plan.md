---
objective: "One command turns the provider's export on, in a scope the user chose, and takes it back off exactly."
status: pending
type: plan
---

# Plan: turning the export on

## Overview

| Field | Value |
| --- | --- |
| **Goal** | `aidd telemetry enable` makes Claude Code emit tokens, cost and timings |
| **Specification** | `ai-driven-dev/framework#646` |
| **Depends on** | #620, done — the journal that this gives something to join against |
| **Unblocks** | #647 the sink, then #617 the diagnostic, then #629 the report |

The journal knows which session served which task. It carries no measurement by
rule. This is the other half of the join: without it there is nothing to attach a
cost to, and the layer produces identifiers pointing at nothing.

## What is proven before planning

**Claude Code reads an `env` block from `settings.json`.** The whole issue rests
on it, and the documentation not only confirms the key but uses OTEL variables as
its own example. Settings resolve highest-first: managed, command line,
`.claude/settings.local.json` (repository root, **not** git-tracked),
`.claude/settings.json` (tracked), `~/.claude/settings.json`.

That precedence is the plan's central fact, because it means **the scope choice
is a sharing choice**: one file affects only the person who ran the command,
another turns telemetry on for everyone who clones the repository.

**The CLI already edits a settings file surgically.** `MarketplaceSyncSettingsUseCase`
upserts one key without disturbing the rest, through `FileReader`/`FileWriter`
ports. This work follows that seam rather than inventing a second way to touch
the same file.

## Three corrections to #646, to make before building

**Two different consents are conflated.** Turning the provider's *export* on is a
per-developer decision about data leaving a process. Whether *run records* get
committed is a per-project decision, already settled and already living in
`.gitignore`. They are not the same question and must not share a mechanism.

**`.aidd/telemetry.json` should not exist.** The settings file the command writes
**is** the record of what was turned on; a second file restates it and the two
would drift. It also sits in a directory `aidd clean` removes, which is why the
issue had to ask whether cleaning resets consent — a question that disappears
once nothing is stored twice.

**"Refuses to run on a public repository unless `--yes`" guards the wrong thing.**
The export goes to an endpoint the user names; repository visibility has no
bearing on it, and detecting visibility needs a network call that can fail. The
real hazard is writing the **tracked** scope, which turns telemetry on for
everyone who clones. Guard that instead: it is a path check, needs no network,
and fails closed.

## Phases

| # | Phase | Ends when |
| --- | --- | --- |
| 1 | [The variable set](./phase-1.md) | the exact block is written down, with what is deliberately absent |
| 2 | [Surgical write and exact removal](./phase-2.md) | enable then disable leaves the file byte-identical to before |
| 3 | [The command and its scope](./phase-3.md) | `aidd telemetry enable` names the file before touching it, and guards the shared scope |
| 4 | [The journeys](./phase-4.md) | an e2e test covers enable, re-enable, disable |

## Standing rules

- **Say the file before writing it.** A command that mutates configuration names
  the path first, every time, whatever the scope.
- **Never touch a key the command did not add.** Enable is an upsert of a known
  set; disable removes exactly that set and leaves everything else, including a
  key the user changed by hand.
- **Idempotent.** Running enable twice changes nothing the second time.
- **Nothing is enabled by installing.** The plugin ships hooks; this command is
  the only thing that turns an export on, and it is an explicit gesture.

## Resources

- #646, the specification.
- `cli/src/application/use-cases/marketplace/marketplace-sync-settings-use-case.ts` —
  the surgical-upsert precedent to follow.
- `cli/src/domain/tools/ai/claude.ts` — where `.claude/settings.json` is already named.
- `cli/tests/e2e/` — the journey shape, and `E2E_MAP.md` for where a new one is listed.
- [Claude Code settings reference](https://code.claude.com/docs/en/settings).
