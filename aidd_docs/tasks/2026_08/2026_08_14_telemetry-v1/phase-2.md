---
status: done
---

# Instruction: the host gate

Part of [`plan.md`](./plan.md).

The hook runs, identifies which tool invoked it, and writes nothing at all. This
is a phase of its own because it is the step most likely to be silently wrong:
misidentifying the host produces records with a wrong `tool`, which no downstream
reader can detect and no later phase can repair.

## What the host is read from, and what it is not

Measured, not read in a documentation.

| Host | Recognised by | This phase |
| --- | --- | --- |
| Cursor | `cursor_version` in the payload | exit 0 |
| Copilot | `sessionId`, and no `hook_event_name` | exit 0 |
| Codex | `transcript_path` matching `/sessions/<yyyy>/<mm>/<dd>/rollout-` | exit 0 |
| Claude Code | `transcript_path` matching `/projects/.*\.jsonl$` | recognised |
| anything else | — | exit 0 |

**Not field names.** Claude Code and Codex hand a `SessionStart` hook the same
five keys — `session_id`, `transcript_path`, `cwd`, `source`, `hook_event_name`.

**Not the environment.** A Codex session launched from inside a Claude Code
session inherits `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PID` from its
parent. Nesting is the normal case here, so env would attribute Codex runs to
Claude Code.

The Codex segment was first recorded under a probe `CODEX_HOME`, so it could have
been an artefact of the probe. Checked against the default home:
`~/.codex/sessions/2026/04/24/rollout-<iso>-<uuid>.jsonl`. The shape is the
tool's. Both hosts end in `.jsonl` and separate on `/projects/` versus
`/sessions/`; Codex is tested first regardless, so the narrower rule wins.

## Architecture projection

```txt
plugins/aidd-telemetry/
  ✏️ hooks/hooks.json             # SessionStart + Stop → journal.js
  ✏️ hooks/journal.js             # host detection, no deps, nothing else yet

scripts/__tests__/
  ✏️ journal.test.js              # replays one recorded payload per host
  ✏️ fixtures/                    # the payloads, verbatim as captured
```

## Tasks to do

### `1)` The hook declaration

1. `hooks/hooks.json` with `SessionStart` and `Stop`, both running
   `node ${CLAUDE_PLUGIN_ROOT}/hooks/journal.js`.

> `Stop`, not `SessionEnd`: Codex allows a session-end handler one second, three
> at most, and does not fire it for subagents. The last observed turn is the only
> reliable end.

### `2)` Detection

1. Read the payload from stdin, parse it, and return a host or `null` per the
   table above. Codex first, Claude Code second, so the narrower path rule wins.
2. On `null`, exit 0 immediately.
3. Wrap everything: unparseable stdin, absent stdin, an exception anywhere — all
   exit 0. A measurement layer never breaks a session.

### `3)` The fixtures

1. Commit one captured `SessionStart` payload per host under
   `scripts/__tests__/fixtures/`. These are recordings, not hand-written
   examples; a hand-written one would encode the assumption being tested.
2. Redact exactly two things, and nothing else: Cursor's `user_email`, and the
   home-directory prefix of every absolute path. Replace them with fixed
   placeholders, keeping the path **shape** intact — the shape is the entire
   point of the fixture.
3. Note the redaction in the fixture directory's README, so the next reader
   knows the files are recordings minus two named fields rather than recordings.

> A verbatim commit would put a real address and a real home path into permanent
> git history, which is precisely the class of leak this layer exists to avoid.
> Detection reads `cursor_version`, `sessionId`, and the `/projects/` versus
> `/sessions/` segments — none of which the redaction touches.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 2 | Replaying the Codex, Copilot and Cursor fixtures yields no host and exit 0 |
| 2 | Replaying the Claude Code fixture yields `claude-code` |
| 2 | An empty payload, a truncated payload, and a payload whose `transcript_path` matches neither shape all yield no host and exit 0 |
| 2 | A real Claude Code session that ends `Not logged in` still reaches detection. The acceptance method, and it costs nothing |
| 3 | Every fixture differs from what the probe captured in exactly two places: `user_email` and the home-directory prefix. Path shapes are unchanged |
| 3 | No fixture contains an email address, a real home directory, or a session id belonging to a real user's work |
