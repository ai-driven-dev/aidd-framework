# aidd_docs/runs

Where the run journal's records land once AIDD telemetry is turned on. This directory being present or committed is **not the permission**. The single authoritative switch is `.aidd/config.json`'s `telemetry.enabled`, read by `plugins/aidd-telemetry/hooks/journal.js` at the point of every write, never cached across a session. With that switch on, `aidd_docs/runs/` is created on demand if it does not already exist; with it off, no record lands here regardless of whether this directory exists. Records are ignored by git (see `.gitignore`), so cloning the repository never carries anyone's session history.

## Shape

One file per session: `<run_id>__<vendor_id>.jsonl`. One JSON object per line, appended and never rewritten — a JSON object is a closed block that can only be rewritten whole, so this is what lets a session leave two hundred observations at the cost of two hundred appends instead of two hundred rewrites, and what lets a process that dies mid-write lose at most the one line it was writing.

`schema_version: 2` on the `session_start` line. Version 1 was a single mutable ten-key object per session, rewritten on every turn (`ended_at`, `tasks[]`, `parent_run_id` among its fields) — replaced because a value frozen at write time cannot be revised, and the hook was writing conclusions (an interval a task attached to, a session's end time) instead of observations.

Every line carries `at` (ISO 8601, UTC, second precision) and `type`:

| `type` | Carries | Fired by |
| --- | --- | --- |
| `session_start` | `schema_version`, `run_id`, `project_id`, `project_remote`, `tool`, `vendor_id`, `vendor_field`, plus `worktree_id` and `worktree_repo_id` when the session ran in a linked git worktree | SessionStart |
| `turn_end` | `prompt_id` when the host provides one, omitted otherwise | Stop |
| `file_written` | `path`, repository-relative and `/`-separated, plus `source` (`"tool-stated"` \| `"observed"`) | PostToolUse, for a write that lands inside a task folder |
| `task_declared` | `path`, repository-relative and `/`-separated | PostToolUse, for a call whose own arguments name a file under a task folder |
| `step_start` | `skill` (sanitised as a value, never as a path segment), plus `turn_id` when the host provides one | PostToolUse, for a call that names a skill being run — a start only, since no tool exposes when a skill's work finishes |
| `scan_truncated` | `cap`, `scanned` | Stop, when the sweep for files a task folder gained since the turn began hit its budget before finishing — so a reader can tell "nothing else changed" from "the walk gave up before it could tell" |

`step_start` is the line that names which skill was running, and the one this table most
recently caught up on documenting: complete coverage of what the journal writes is the
whole reason a report can attribute a token to a step at all.

`file_written`'s `source` says how the path came to be known. `"tool-stated"` is a path the
host handed over directly — exact, with no false positive. `"observed"` is a file that
changed inside a task folder while the session was running, the only way a write made
through a shell command or an `apply_patch` becomes visible at all — and it can, in
principle, catch a file something else on the machine wrote in the same window. A reader
that must not risk that filters on this field.

`worktree_id` is git's own name for the linked worktree the session ran in, and `worktree_repo_id` names the repository those worktrees share — read from one `git rev-parse`, never from an agent runner's environment variable, which names that runner's concept rather than the repository's. A plain checkout, the common case, carries **neither key at all**: absent, never `null` and never `""`, because an empty string would gather every plain checkout into one group as though they were the same worktree.

Neither `file_written` nor `task_declared` ever carries a `task_id`: task identity is a derivation from the path, and derivations belong to whatever reads the log, not to the hook that writes it. `task_declared` differs from `file_written` in what it takes as evidence, not in what it stores: a mention in a tool call's arguments (a read, an edit, a shell command line) rather than a payload naming a write outright - the move that reaches a task on a tool whose payload never hands over a written path at all. A reader turns a run of `task_declared` lines into a bounded interval, closed by whichever of a later declaration or a `turn_end` comes next; see `aidd_docs/product/metrics-contract.md`'s "Attributing records to a task".

Whether any of these records is ever shared beyond the machine that wrote it is undecided. Nothing here sends anything anywhere.

## The one marker outside a session file

A payload that fires but matches no declared host writes a seventh, different kind of
line: `{ "type": "unrecognised_payload", "at": ... }`, to its own fixed file,
`_unrecognised.jsonl` — never to a `<run_id>__<vendor_id>.jsonl`, since an unrecognised
payload carries no session identity to name one by. That file holds at most one line,
overwritten on every occurrence rather than appended to: it is a marker that this fired at
all, not a log of how often. `aidd telemetry check` reads it to tell "a hook that never
fires" apart from "a hook that fires from a host this build does not yet declare."
