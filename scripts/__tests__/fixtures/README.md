# Fixtures: recorded hook payloads

One real, captured `SessionStart` hook payload per host: `claude-code-session-start.json`,
`codex-session-start.json`, `copilot-session-start.json`, `cursor-session-start.json`.
Captured by the `out-*-skill` probe runs referenced in issue #663's 2026-08-20 comment.

Four real, captured Claude Code `PostToolUse` payloads, one per observed tool:
`claude-code-post-tool-use-write.json`, `-edit.json`, `-notebook-edit.json` (the three tools
that write; `Write`/`Edit` carry `tool_input.file_path`, `NotebookEdit` carries
`tool_input.notebook_path` instead), and `-bash.json` (a non-write tool, captured to prove the
tool-name whitelist actually rejects something rather than never being exercised). Captured by
the `out-cc-skill` probe run.

Two real, captured `PostToolUse` payloads for the path-family extractor, captured while a
skill's own `SKILL.md` was read mid-session — the shape the path-family extractor needs, not
a schema:

- `codex-post-tool-use.json` — captured by `out-codex-skill`. `tool_name` is `Bash` (Codex's
  hook names every shell-backed tool `Bash`, not the `exec_command` its own transcripts
  record — see plan.md); the `SKILL.md` path lives inside `tool_input.command`, not a
  dedicated field.
- `cursor-post-tool-use.json` — captured by `out-cursor-skill`. `tool_name` is `Read`; the
  `SKILL.md` path lives in `tool_input.file_path`.

## The four step-opening payloads

One per host, each the call that opens a step. Two families, and the fixtures are what prove
the split is real rather than a tidy story:

- `claude-code-post-tool-use-skill.json` — `tool_name` is `Skill`, the name sits in
  `tool_input.skill`, and the payload carries `prompt_id`: the same value the CLI sink stores
  as its turn key, which is why a step joins to its cost by identifier here and by ordering
  elsewhere.
- `copilot-post-tool-use-skill.json` — `toolName` is `skill`, and `toolArgs` is a **JSON
  string**, not an object. It has to be parsed. No turn identifier reaches a Copilot hook.
- `codex-post-tool-use-skill-read.json` — no skill is named anywhere. Only a relative
  `SKILL.md` path inside `tool_input.command`, on a tool the hook calls `Bash`.
- `cursor-post-tool-use-skill-read.json` — no skill is named either. An absolute `SKILL.md`
  path in `tool_input.file_path`, with the turn identifier spelled `generation_id`.

A fifth belongs to this set: `copilot-compat-post-tool-use-skill.json`, Copilot's second
payload shape invoking a skill. See "Copilot's second shape, invoking a skill" below —
kept out of this list because it is a second shape for a host already listed here, not a
fifth host.

These are recordings, not hand-written examples — a hand-written fixture would encode the
assumption being tested rather than what a host actually sends.

## Copilot's second shape

`copilot-compat-session-start.json`, `copilot-compat-post-tool-use.json`,
`copilot-compat-turn-end.json` — one per event, captured from a real
`@github/copilot@1.0.80` session running the framework's own installed plugin
(issue #681's `Done when`). Where `copilot-session-start.json` and
`copilot-post-tool-use-skill.json` are Copilot's canonical builder (`sessionId`,
`toolName`/`toolArgs` as a JSON string, no `hook_event_name`), these three are its
`_vsCodeCompat` builder: `session_id` and `hook_event_name` spelled Claude Code's way,
`tool_name`/`tool_input` as an object rather than a string, and a `timestamp` field both
shapes carry but no other host does. Which builder a session gets depends on how its
hooks are declared (PascalCase event keys trigger the compat rewrite - see #681's
source-read chain); a real install can produce either, so `detectHost` recognises both.

`lib/step-starts.cjs`'s `STEP_START_BY_HOST.copilot` used to read only the canonical
shape's `toolName`/`toolArgs` - a compat `PostToolUse` never opened a step line, skill or
not. Left unfixed by #681 on purpose: that ticket's own scope was `detectHost` and the
session id it feeds, and closing the gap needed a capture #681 never took - a session that
actually invokes a skill under the compat builder, not just a Bash call.

## Copilot's second shape, invoking a skill

`copilot-compat-post-tool-use-skill.json` — captured 2026-08-22 against a real
`@github/copilot@1.0.80` session, asked by name to run the framework's own installed
`aidd-telemetry` plugin's `00-init` skill (issue #701's `Done when`). The two unknowns
#701 opened on both settle from this one payload: `tool_name` is `skill` - the same
lowercase spelling the canonical builder uses, not Claude Code's `Skill` - and
`tool_input` arrives as an **object** keyed `skill`, matching Claude Code's own
`tool_input.skill` rather than the canonical builder's JSON-string `toolArgs`. Neither
value was guessable from the other two captures: the compat builder mixes one host's
tool-name spelling with another host's argument shape.

`STEP_START_BY_HOST.copilot` now tries both shapes in sequence - the canonical
`toolName`/`toolArgs` reader, then this compat `tool_name`/`tool_input` reader - so a
skill call opens a step line on either payload, and a non-skill call (`Bash`, per
`copilot-compat-post-tool-use.json`) still opens none on the compat shape either.

## Redaction

Every fixture differs from what its probe captured in only two kinds of place:

- `user_email` — replaced with the placeholder `user@example.com` (Cursor only carries this
  field).
- Every absolute path — the real home-directory or scratchpad-tmp prefix replaced with
  `/home/user/probe/...` (or, for a Cursor `transcript_path`, `/home/user/.cursor/...`),
  keeping the path **shape** intact. This includes paths that appear twice inside one
  payload, such as `cursor-post-tool-use.json`'s `tool_input.file_path` and its duplicate
  inside `tool_output`.

Detection reads `cursor_version`, `sessionId` (Copilot's canonical shape) / `session_id`
(every other host, and Copilot's compat shape) plus `timestamp` and `hook_event_name`
together, and the `/projects/` versus `/sessions/` segments of `transcript_path` — none of
which the redaction touches. `copilot-compat-turn-end.json`'s `transcript_path` is redacted
the same way as every other path, with its `.copilot/session-state/` segment kept intact:
that segment is shape, and shape is exactly what proves it matches neither the Codex nor
the Claude Code pattern.

## Hosts declared vs. hosts that currently write

All four hosts are declared in `lib/host.cjs`'s `DECLARED_HOSTS` and `lib/record.cjs`'s per-host
tables — declaring a host's session-id spelling and export-side `vendor_field` is independent
of whether the journal writes for it today:

- **Copilot** writes now, on both shapes. The `hook_event_name`-never-arrives premise above
  was read from a bundle, not a payload (issue #681); a real capture refuted it — the compat
  shape carries `hook_event_name` with Claude Code's own spelling (`SessionStart`,
  `PostToolUse`, `Stop`). What was true, and stays true: neither shape's payload carries an
  event name journal.cjs's own dispatch reads from, since it dispatches from argv (the event
  name `hooks.json` passes on its command line), and every replay in this suite drives that
  argv the same way. `resolveEventName` reading `hook_event_name` is only ever the fallback
  for a payload replayed with no argv at all.
- **Cursor** fires no `Stop`-equivalent hook when run headless (`sessionEnd` arrives instead,
  and is not mapped to `turn-end` — see issue #680); its `SessionStart`-equivalent still
  writes normally. `vendor_field` is `null` for Cursor specifically because its telemetry
  export itself is unmeasured (an Enterprise team setting), not because of either open issue.
  Cursor's own payload carries no `cwd` at all, only `workspace_roots` (a multi-root
  workspace can list several, not all of them git repositories) — `lib/repo.cjs`'s
  `readCwd`/`CWD_READER_BY_HOST` resolves the first entry that actually is one, the same way
  `lib/record.cjs`'s `readSessionId` resolves Cursor's differently-spelled session id.
