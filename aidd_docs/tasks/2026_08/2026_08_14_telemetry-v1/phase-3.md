---
status: done
---

# Instruction: opt-in, and where a run is written

Part of [`plan.md`](./plan.md).

The first file appears. Two questions decide whether it may be written and where
it goes, and both are answered without a config format, a CLI call, or a network
request.

## Tasks to do

### `1)` The opt-in gate

1. Write only when `aidd_docs/runs/` exists as a directory. Otherwise exit 0.
2. Ship a `.gitkeep` and a short `README.md` beside it, stating what committing
   the directory turns on.

> One existence check replaces a whole requirement. #620 asks that nothing be
> written on a public repository before opt-in; making opt-in unconditional means
> repository visibility is never detected at all — no `gh` call, no network — and
> the failure direction is off rather than on.

### `2)` Where the file goes

1. `<repoRoot>/aidd_docs/runs/<run_id>__<vendor_id>.json`. `AIDD_RUNS_DIR`
   overrides the directory outright.
2. `.gitignore` carries `aidd_docs/runs/*` with the two marker files negated, so
   the directory enters git and the records never do.

> **This started outside the repository and moved back in.** The original reason
> was that `Stop` fires every turn, so a tracked file would leave the working tree
> permanently dirty. Ignoring the contents answers that completely — verified in a
> scratch repository: `git add -A` mid-session sweeps nothing, and the tree stays
> clean.
>
> The second reason was parallel git worktrees, six of which are active on this
> repository today: a per-checkout store gives each a partial view. That one is
> real but narrow — it holds only for records not yet shared, and one file per
> session means they can never conflict. It did not justify the cost.
>
> The cost was large and permanent. `~/.local/state` is nobody's to control:
> invisible, per-machine, unbacked-up, and it required three platform branches for
> a directory no one would ever open. Keying it by `project_id` forced an
> `owner/repo` → `owner__repo` flattening, which carried its own collision
> (a remote-less repository named `foo__bar`). And the opt-in marker was not the
> store, so the directory that authorised had to be explained in a README.
>
> In-project, all of that disappears at once: the gate *is* the store, the
> repository root *is* the key, and the platform no longer matters.
>
> The store and the gate being one directory also means a record deleted with the
> project is gone, which is the right behaviour rather than an accident.

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
| 2 | The working tree is clean after a session with several turns, and `git add -A` mid-session stages no record |
| 2 | The marker files are tracked and a record is not, proven against a real repository rather than by reading `.gitignore` |
| 2 | Nothing is ever written under a home directory |
| 3 | Two repositories produce records separable on `project_id`, which stays in the record though no longer in the path |
| 3 | A repository with no remote still produces a record, keyed on its basename |
| 4 | Ten turns in one session produce one file, not ten |
