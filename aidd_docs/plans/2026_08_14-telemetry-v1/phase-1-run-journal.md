---
status: pending
---

# Instruction: the run journal, issue #620

Part of [`plan.md`](./plan.md).

This file carries build order and file paths only. Every contract it depends on
lives in #620, which is the specification. Two of those contracts were wrong
until measured on 2026-08-16; the measurements are recorded here because they
are what justifies the order, and they have been written back into #620.

## What was measured today, before writing a line

**Installing the plugin does activate its hooks.** `plugin.json` declares no
`hooks` key anywhere in this repository, so the premise "installing the plugin
installs the mechanism" was unproven — the bundled hook might only have reached
users through `aidd framework build` copying `hooksBundle`, in which case the
opt-out is not "do not install it" and the CLI does wire per tool. Probed with
the local marketplace under an isolated `CLAUDE_CONFIG_DIR`: after
`claude plugin install aidd-context@aidd-framework`, one session filled the
`<aidd_project_memory>` block. `hooks/hooks.json` is discovered by convention.
The premise holds.

The same probe answered a second question for free: the hook fired on a session
that ended `Not logged in`. **Session start, and therefore the journal, costs
nothing to verify.** That is the acceptance-test method for every done-when
below.

**The host cannot be identified from field names, and env vars are worse.**
Claude Code and Codex both hand a `SessionStart` hook the same five keys —
`session_id`, `transcript_path`, `cwd`, `source`, `hook_event_name`. Presence
does not discriminate. Environment is actively misleading: a Codex session
launched from inside a Claude Code session sees `CLAUDECODE`,
`CLAUDE_CODE_SESSION_ID` and `CLAUDE_PID` inherited from its parent. Nesting is
the normal case in this project, so any env-based detection would attribute
Codex runs to Claude Code.

The discriminator that survives both is `transcript_path`, whose shape is
tool-specific and recorded in the probe outputs:

| Host | Recognised by | v1 |
| --- | --- | --- |
| Cursor | `cursor_version` in the payload | exit 0 |
| Copilot | `sessionId`, and no `hook_event_name` | exit 0 |
| Codex | `transcript_path` matching `/sessions/<yyyy>/<mm>/<dd>/rollout-` | exit 0 |
| Claude Code | `transcript_path` matching `/projects/.*\.jsonl$` | **writes** |
| anything else | — | exit 0 |

The last row is what makes this safe: unrecognised means silent, so a fifth tool
or a changed path shape degrades to writing nothing rather than to writing a
wrong `tool` field.

The Codex segment was recorded under a probe `CODEX_HOME`, so it could have been
an artefact of the probe. Checked against the default home: `~/.codex/sessions/`
holds `2026/04/24/rollout-<iso>-<uuid>.jsonl`. The shape is the tool's, not the
probe's. Both hosts end in `.jsonl`, and they are disjoint on `/projects/` versus
`/sessions/`; Codex is tested first regardless.

## Architecture projection

```txt
plugins/aidd-telemetry/
  ✏️ .claude-plugin/plugin.json   # name, version, description, no skills[]
  ✏️ hooks/hooks.json             # SessionStart + Stop → journal.js
  ✏️ hooks/journal.js             # the whole mechanism, one file, no deps
  ✏️ README.md · CHANGELOG.md

.claude-plugin/marketplace.json   # entry, recommended: false
docs/ARCHITECTURE.md              # bundled-hooks table, plugin-concerns table
README.md                         # regenerated counts, plugin section
scripts/__tests__/journal.test.js # node:test, the plugin ships no tests of its own
lefthook.yml                      # a command that actually runs node --test
```

`scripts/__tests__/` holds the tests because `docs/ARCHITECTURE.md` says a
plugin never contains its own: the build copies `hooks/` recursively into every
user project, so a test folder there ships to them.

## Tasks to do

### `1)` The plugin shell

> Make the plugin exist and be installable before it does anything.

1. `plugin.json` with `name: aidd-telemetry`, `version: 0.1.0`, a description
   naming the concern (measurement), and no `skills` array.
2. Marketplace entry with `recommended: false` — the opt-out is not installing
   it, so it must never arrive by default.
3. `docs/ARCHITECTURE.md`: one row in the bundled-hooks table, one row in the
   plugin-concerns table. The concern is measurement, which is neither knowledge
   production, nor code transformation, nor version control.
4. `node scripts/sync-readme-counts.mjs` — the hero count moves from 7 to 8.

### `2)` The journal, write path only

> One session, one file, no attachment yet.

1. `hooks/hooks.json`: `SessionStart` and `Stop`, both
   `node ${CLAUDE_PLUGIN_ROOT}/hooks/journal.js`.
2. Host detection per the table above. Unrecognised → exit 0, write nothing.
3. Opt-in gate: write only when `aidd_docs/runs/` exists as a directory. One
   existence check, no config format, no CLI, no network call, and no repository
   visibility detection — a project opts in by committing the directory, and the
   failure direction is off.
   The directory that authorises is not the directory that receives, and until
   task 4 ships it stays empty in git. Two things follow. Its `.gitkeep` carries
   a one-line README beside it saying what committing the directory turns on, so
   a reviewer six months out reads an intention rather than an accident. And
   `status` (#617) must report that state as **on, not yet materialised** — the
   gate is open, the journal is being written out of the repository, nothing has
   landed in it. Reporting it as "on" would hide a missing half; reporting it as
   "not wired" would claim a failure that is not one.
4. `run_id`: a ULID minted at `SessionStart`, stored in the file whose name it
   is. Reused on `Stop` by looking the file up on `vendor_id`.
   `vendor_field` names the **export-side attribute**, so `session.id` on Claude
   Code — not `session_id`, the hook field it was read from. The only consumer is
   #629's join, which queries telemetry; a reader handed the hook's field name
   would have nothing to look it up by.
5. `project_id`: derived from `git remote get-url origin` as `owner/repo`,
   falling back to the repository root's basename. Never stored — #646 pushes
   the same value into `OTEL_RESOURCE_ATTRIBUTES` and must derive it by the same
   rule rather than read it from a file, so there is one rule and no second
   writer.
6. Session-time writes land outside the repository, under
   `${XDG_STATE_HOME:-~/.local/state}/aidd/runs/<project_id>/<run_id>.json`.
   `Stop` fires every turn; a tracked file rewritten every turn would leave the
   working tree permanently dirty.
7. Every failure path exits 0. A measurement layer that breaks a session is
   worse than one that misses a session.

### `3)` Attachment

> `task_id` intervals, and the pointer that feeds them.

1. Read `.aidd/current-task` if present. Absent → the interval carries
   `task_id: null`, which is out-of-flow work and a normal state.
   The pointer is deliberately ephemeral, and gitignoring it is the point rather
   than an oversight: it answers "what is being worked on right now", it is
   written by the planning and implementation skills, and a fresh clone
   legitimately has no answer until one of them runs. `aidd clean` wiping it
   mid-work costs one interval boundary, and the next skill invocation rewrites
   it. What must not happen is `status` reading an absent pointer as a broken
   installation — #617 distinguishes *no pointer* from *pointer stale* from
   *hook silent*, and only the last two are faults.
2. On `Stop`, close the open interval and open a new one when the pointer's
   value has changed. Two concurrent sessions in one checkout share the pointer;
   last-writer-wins plus an interval boundary records the mis-attribution
   instead of pretending to prevent it, and needs no new mechanism.
3. `.aidd/` gets a `.gitignore` line. It is currently neither tracked nor
   ignored, and `aidd clean` nukes it.
4. `parent_run_id` is written and always `null` in v1: a Claude Code subagent
   shares its parent's session id and differs only by `query_source`, a
   telemetry attribute no hook ever sees.

### `4)` Materialisation into the repository

> The one step whose owner is not obvious, and the one to confirm before building.

Session-time records live outside the repository; the decision of record is that
they are materialised into `aidd_docs/runs/<yyyy_mm>/` at commit. The plugin
cannot own this: its hooks only see sessions, and a commit can be made by a
human with no session running. Only git knows a commit happened, so the trigger
is a git `post-commit` hook, installed by the CLI gesture that #646 already owns.

Scope is exactly: copy the run files touched since the last materialisation, and
nothing else. **Confirm the owner before building this step** — it is the only
one that puts who-worked-on-what-and-for-how-long into permanent git history,
which #652 says cannot ship without an organisational decision. Everything above
it is reversible; this is not.

### `5)` Tests and the runner

> There is no test runner today. `scripts/__tests__/` holds one file and nothing invokes it.

1. `scripts/__tests__/journal.test.js`, `node:test`, covering the payload
   fixtures recorded per host, the opt-in gate, the key whitelist, the interval
   transitions, and every failure path exiting 0.
2. A `lefthook.yml` pre-commit command running `node --test scripts/__tests__/`,
   skipping with a notice when node is absent, matching the existing commands'
   shape.
3. The 200 ms budget is asserted on in-process work, not on process spawn, which
   is flaky under CI load. Spawn latency is a separate manual smoke, stated as
   such so the test is not written twice.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | `claude plugin install aidd-telemetry@aidd-framework` succeeds against the local marketplace; `sync-readme-counts.mjs --check` exits 0 |
| 2 | A session with `aidd_docs/runs/` absent writes nothing and exits 0. With it present, one file appears whose top-level keys are exactly the ten in #620, asserted as a whitelist |
| 2 | Replaying the recorded Codex, Copilot and Cursor `SessionStart` payloads writes nothing and exits 0 |
| 2 | Two repositories on one machine produce records separable on `project_id` |
| 3 | A session with no pointer produces a record with one interval and `task_id: null`, never no record |
| 3 | A session whose pointer changes mid-way produces two intervals, never one overwritten value |
| 4 | Two agents on the same task in two worktrees produce two files, and merging both branches conflicts on nothing |
| 5 | `node --test scripts/__tests__/` passes and is invoked by lefthook on a staged change under `plugins/aidd-telemetry/hooks/` |
| 5 | A session that fails to log in still journals — the acceptance method, and it costs nothing |

## Resources

- #620, which is the specification; this file is only its order.
- `plugins/aidd-context/hooks/` — the proven bundled-hook pattern, and the one
  the activation probe exercised.
- `cli/src/application/use-cases/framework/strategies/tool-contracts.ts` —
  `hooksBundle`, which copies `hooks/` into all five tool targets with no
  exclusion mechanism. This is why the plugin must be separate.
- The recorded hook payloads, one per host, reusable as test fixtures.
