---
status: pending
---

# Instruction: the command, and the scope it writes

Part of [`plan.md`](./plan.md).

`aidd telemetry enable` and `aidd telemetry disable`. Thin wrappers over phase 2,
per the repository's command convention — the judgement lives in the use-case,
not in the handler.

The only real decision here is **which file**, and it is a sharing decision
wearing a configuration costume.

## The three scopes, and what each one means

| Scope | File | Who it turns telemetry on for |
| --- | --- | --- |
| `local` *(default)* | `.claude/settings.local.json` | only you, only this repository. Not git-tracked |
| `project` | `.claude/settings.json` | **everyone who clones**, from the commit onward |
| `user` | `~/.claude/settings.json` | you, in every repository on this machine |

## Tasks to do

### `1)` Default to the scope that surprises nobody

1. `--scope local` is the default.

> Turning on an export that sends data to an endpoint is a decision about someone
> else's process and someone else's data. Making it for one person by default,
> and making the shared choice explicit, is the only ordering where a mistake is
> recoverable.

### `2)` Guard the shared scope

1. `--scope project` requires `--yes`, and without it stops with what it would
   have done: this commits telemetry on for everyone who clones the repository.

> This replaces #646's "refuses to run on a public repository unless `--yes`".
> Repository visibility is the wrong signal — the export goes to an endpoint the
> user named, and their private repository is not safer than their public one.
> The hazard is the **tracked file**, which is a path, needs no network call, and
> cannot fail open.

### `3)` Say the file before touching it

1. Print the resolved absolute path, then act. On every scope, every run.
2. Print what changed, or that nothing did.

### `4)` The endpoint is asked for, never guessed

1. `--endpoint` names it; interactively, prompt. No default host, ever.

> A default endpoint in a telemetry command is a default destination for someone
> else's data. There is no value that is safe to assume, including localhost,
> which would silently succeed and export nothing anyone reads.

### `5)` No consent file

1. Write no `.aidd/telemetry.json`. The settings file **is** the record.

> #646 asked for one, and for a rule about whether `aidd clean` should preserve
> it. Both disappear together: nothing is stored twice, so nothing can drift, and
> a directory `clean` removes cannot hold the only copy of a decision.
>
> "Is telemetry on" is answered by reading the settings file — which is #617's
> job, and it must read the real file rather than a record of intent, or it
> reports what someone meant instead of what is true.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | With no `--scope`, the local file is written and the tracked one is untouched |
| 2 | `--scope project` without `--yes` exits non-zero, writes nothing, and says it would affect everyone who clones |
| 2 | `--scope project --yes` writes the tracked file |
| 3 | The resolved path appears in the output before the file changes, in all three scopes |
| 4 | Non-interactive with no `--endpoint` fails rather than choosing one |
| 5 | No file is created under `.aidd/` |
| 5 | The command handler contains no judgement — the decisions live in the use-case, per the repository's command convention |
