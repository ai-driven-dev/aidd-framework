# One place per nature

## The ask

Fewer files at a person's scope, centralised, coherent — and the minimum for a person to
execute before telemetry works. Raised alongside a finding: `AIDD_USER_CONFIG_DIR` moves the
GitHub token, and the plugin README tells a team to share that directory.

## What is there today, measured

Six things under `~/.config/aidd/` (`%APPDATA%\aidd` on Windows), and they do not share a
resolution rule:

| file | nature | resolved by |
| --- | --- | --- |
| `identity.json` | a person's own choice | OS profile only — **refuses** `AIDD_USER_CONFIG_DIR` (`home-dir.ts:30`) |
| `auth.json` | a secret | `AIDD_USER_CONFIG_DIR` (`auth-storage.ts:19`) |
| `marketplaces.json` | a choice, at two scopes | `AIDD_USER_CONFIG_DIR` (`marketplace-registry-adapter.ts:77`) |
| `update-check.json` | a cache | `AIDD_USER_CONFIG_DIR` (`check-update-use-case.ts:20`) |
| `telemetry/<day>.jsonl` | the measurement | `AIDD_USER_CONFIG_DIR` (`telemetry-sink-adapter.ts:104`) |
| `person-mapping.json` | nothing — dead | never read (`person-identity-adapter.ts:18`) |

## The variable carries two purposes, and only one is safe to share

1. **Relocate a machine's aidd config.** `cli/aidd_docs/memory/testing.md:109` names it as how
   a test isolates aidd's user config while keeping a real `HOME` for `gh`/`git`. Legitimate,
   and used (`e2e/helpers.ts:136`).
2. **Share measurement across a team.** `plugins/aidd-telemetry/README.md:186` — "Point
   `AIDD_USER_CONFIG_DIR` at a directory a team shares".

Purpose 2 was added on top of purpose 1. Following the README therefore relocates the token
too. `chmod 0600` holds on a local POSIX filesystem; a network share or a synced folder is
what "a directory a team shares" usually means, and neither guarantees it. Independently of
permissions: two people pointing at one directory overwrite each other's `auth.json`.

**Decision.** The measurement gets its own location, `AIDD_TELEMETRY_DIR`, naming the
directory itself. `AIDD_USER_CONFIG_DIR` keeps purpose 1 and is still honoured by the sink as
a fallback, so no existing setup breaks. The README stops naming the variable that also moves
a secret.

## Rescoped: identity and marketplaces do not merge

The ask included folding `identity.json` and `marketplaces.json` into one `config.json`.
Verified against the repository, that costs more than it returns:

- **It would weaken a guarantee.** `identity.json` refuses `AIDD_USER_CONFIG_DIR` on purpose —
  "that variable is a location a repository or a CI job can set, and reaching the identity
  file through it would not be this person's own choice to make" (`home-dir.ts:30`).
  `marketplaces.json` honours it. One file cannot do both. Merging either strips a CI of a
  capability it has today, or lets a repository set a person's identity.
- **It would give one concept two names.** A marketplace registry exists at **two** scopes:
  `.aidd/marketplaces.json` and the user's own (`marketplace-registry-adapter.ts:70-79`).
  Renaming only the user-scope half to `config.json` leaves the project-scope half as
  `marketplaces.json`.

Net: one fewer file, two coherence regressions. It does not earn itself. Recorded here rather
than silently dropped.

## What ships

1. `AIDD_TELEMETRY_DIR` names the measurement directory. `AIDD_USER_CONFIG_DIR` stays a
   fallback for it, and stops being the documented way to share.
2. `update-check.json` moves to `cache/update-check.json` — a cache, in the cache directory,
   read back from the old path when the new one is absent.
3. `person-mapping.json` handling is deleted: dead, and named only so `status` could call it
   safe to remove.

Person scope after: `identity.json`, `auth.json`, `marketplaces.json`, `cache/`, `telemetry/`.
Each with one resolution rule that matches its nature.

## What this does not change

The count of commands a person runs. That was the other half of the ask and it was answered
separately: `report` now catches the sink up, so the path is `on` then `report`.

## Acceptance

- A person who points `AIDD_TELEMETRY_DIR` at a shared directory shares measurement and
  nothing else — proven by asserting the token's resolved path is unchanged.
- An existing setup using `AIDD_USER_CONFIG_DIR` for the sink keeps working, and is told
  which variable to move to — at runtime, by every command that touches the figures, not only
  in a document those people already read once and acted on wrongly
  (`warnIfFiguresMoveTheTokenToo`).
- An existing `update-check.json` at the old path is still read; nothing re-fetches because a
  cache appeared to be missing.
- No **new** file appears at a person's scope, and no command deletes one. Written as "no
  file is written by a command whose job is to answer a question" in the first draft, which
  was wrong on its own terms: `report` catches the sink up, so it appends to a day file by
  design (recorded under "What this does not change"). What it must never do is create a new
  kind of file, or destroy one — the destroying half was a real defect and is fixed
  (`read-local-cost-use-case.ts`, pruning restricted to a sweep).
