---
status: pending
---

# Instruction: opt-in, and where a run is written

Part of [`plan.md`](./plan.md).

The first file appears. Two questions decide whether it may be written and where
it goes, and both are answered without a config format, a CLI call, or a network
request.

## Tasks to do

### `1)` The opt-in gate

1. Write only when `aidd_docs/runs/` exists as a directory. Otherwise exit 0.
2. Ship a `.gitkeep` and a one-line `README.md` beside it in this repository,
   stating what committing the directory turns on.

> One existence check replaces a whole requirement. #620 asks that nothing be
> written on a public repository before opt-in; making opt-in unconditional means
> repository visibility is never detected at all — no `gh` call, no network — and
> the failure direction is off rather than on.
>
> The README matters more than it looks. The directory that authorises is not the
> directory that receives, so until phase 6 it stays empty in git. Without a line
> saying why, a reviewer six months out reads an accident.

### `2)` Where the file goes

1. `${XDG_STATE_HOME:-~/.local/state}/aidd/runs/<project_id>/<run_id>.json`.

> Outside the repository, because `Stop` fires every turn: a tracked file
> rewritten throughout a session leaves the working tree permanently dirty, and
> every commit would carry noise nobody asked for.

### `3)` `project_id`

1. Derive it from `git remote get-url origin` as `owner/repo`, falling back to
   the repository root's basename when there is no remote.
2. Never store it anywhere else.

> #646 pushes the same value into `OTEL_RESOURCE_ATTRIBUTES` and derives it by
> this same rule. One rule, no second writer, nothing to keep in sync. Without it
> a sink mixes every repository on a machine with nothing to separate them, and
> it cannot be recovered after the fact.

### `4)` `run_id`

1. Mint a ULID at `SessionStart`. The file is named after it.
2. On `Stop`, find the existing file by `vendor_id` rather than minting again.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | With `aidd_docs/runs/` absent, a session writes nothing and exits 0 |
| 1 | With it present, one file appears |
| 2 | The repository's working tree is clean after a session with several turns |
| 3 | Two repositories on one machine produce records separable on `project_id` |
| 3 | A repository with no remote still produces a record, keyed on its basename |
| 4 | Ten turns in one session produce one file, not ten |
