---
status: blocked
---

# Instruction: materialisation at commit

Part of [`plan.md`](./plan.md).

**Do not build this phase before its owner is confirmed.** Phases 1 to 5 write
outside the repository and can be deleted without trace. This one writes into git
history, and git history is not deletable in practice.

## Why the plugin cannot own it

Its hooks only ever see sessions. A commit can be made by a human with no session
running, by a script, by a rebase. Only git knows a commit happened, so the
trigger is a git `post-commit` hook, installed by the CLI gesture that #646
already owns.

That places one framework capability outside a plugin, which is a real exception
to `docs/ARCHITECTURE.md` and should be recorded there as one, with this reason.

## What it does, and nothing more

Copy the run files touched since the last materialisation into
`aidd_docs/runs/<yyyy_mm>/`. Not aggregate, not summarise, not enrich, not
prune.

## The decision it waits on

Materialising puts who-worked-on-what-and-for-how-long into permanent history.
#652 records that this cannot ship without an organisational decision, and #660
holds the policy work. Two guards already make deferring safe: the record carries
no author field ever, and vendor identity attributes are dropped at ingest and
replaced by one salted label.

Deciding after the data exists is deciding too late.

## Tasks to do

### `1)` Confirm the owner

1. Confirm the `post-commit` hook and the CLI as its installer, or name another.

### `2)` The copy

1. Copy only files whose `ended_at` is newer than the last materialised copy.
2. Path `aidd_docs/runs/<yyyy_mm>/<run_id>.json`, one file per session, unchanged
   content.

### `3)` Never block a commit

1. Any failure — no state directory, unreadable file, no write permission —
   leaves the commit alone and exits 0.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 2 | Two agents on the same task in two worktrees produce two files, and merging both branches conflicts on nothing |
| 2 | A second commit with no new session copies nothing |
| 2 | The materialised content is byte-identical to the out-of-repository file |
| 3 | A read-only `aidd_docs/runs/` does not fail the commit |
| 3 | A week of real work on this repository is journaled and materialised, with the attached and out-of-flow shares, and no session lost |
