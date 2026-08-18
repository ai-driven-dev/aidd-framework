---
status: pending
---

# Instruction: the command

Part of [`plan.md`](./plan.md).

`aidd telemetry on` and `aidd telemetry off`. A thin wrapper, per the repository's
command convention: the judgement lives in the use-case.

Two things happen when it runs, and keeping them distinct is the point — it sets
the AIDD switch, and it configures whichever tools are installed and can be
configured.

## Why a command and not a skill

Both were on the table. The split follows what each can actually do.

A skill runs inside a session, in the model's context, and is the right place to
**read state and explain it** — that is #617. It is the wrong place to write
configuration that must be exactly reversible, because the thing that records
what was written and removes exactly that is `.aidd/manifest.json`, which the CLI
owns.

A command runs outside any session, which is also the only place that can set an
environment variable a session will read: those are resolved at process start, so
a hook writing one takes effect a session late.

So: the CLI writes, the skill explains, and neither reimplements the other.

## Tasks to do

### `1)` Set the switch, then the tools

1. Write `aidd_docs/telemetry.json` from phase 1.
2. Then configure every installed tool that can be configured, one adapter each.
3. Report per tool what happened, including the tools that were skipped.

### `2)` Report honestly per tool

1. Enabled — with the file that was written.
2. Not installed — skipped.
3. **Cannot be enabled by us** — Cursor's export is a team setting on an
   Enterprise plan, in beta. Say it plainly and point at what the user must do.
4. **Not a file** — Copilot reads `COPILOT_OTEL_ENABLED` from the environment, so
   print the variable rather than pretending to have set it.

> A command that prints "telemetry enabled" while one of five tools is silently
> unconfigured is the failure this whole layer exists to catch, committed by the
> tool meant to prevent it.

### `3)` The scope, which is a sharing decision

| Scope | File | Turns telemetry on for |
| --- | --- | --- |
| `local` *(default)* | `.claude/settings.local.json` | you, this repository. Not git-tracked |
| `project` | `.claude/settings.json` | **everyone who clones** |
| `user` | `~/.claude/settings.json` | you, every repository on this machine |

1. Default to `local`.
2. `--scope project` requires `--yes`, and without it stops saying what it would
   have done.

> This replaces #646's "refuses on a public repository unless `--yes`".
> Repository visibility is the wrong signal: the export goes to an endpoint the
> project named, and a private repository is not safer than a public one. The
> hazard is the tracked file. Checking a path needs no network and cannot fail
> open.
>
> Note the asymmetry, and keep it: **the switch is project-scoped and committed,
> the tool configuration defaults to personal.** Consenting to be measured is the
> project's call; sending data from your machine is yours.

### `4)` Say the file before touching it

1. Print each resolved absolute path, then act. Every scope, every run.
2. Print what changed, or that nothing did.

### `5)` `off` is exact

1. Set the switch off, and remove exactly the entries the manifest recorded.
2. `off` on a project that was never on succeeds and changes nothing.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | With no tool installed, the switch is still written and the command says so |
| 2 | Cursor is reported as not enableable by us, never as enabled |
| 2 | Copilot's environment variable is printed, not silently assumed |
| 3 | With no `--scope`, the local file is written and the tracked one is untouched |
| 3 | `--scope project` without `--yes` exits non-zero and writes nothing, checked on disk |
| 4 | Every resolved path appears in the output before the file changes |
| 5 | on then off leaves every touched file byte-identical to before |
| 5 | The handler carries no judgement — it lives in the use-case |
