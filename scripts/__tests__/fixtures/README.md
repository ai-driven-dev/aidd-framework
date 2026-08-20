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

These are recordings, not hand-written examples — a hand-written fixture would encode the
assumption being tested rather than what a host actually sends.

## Redaction

Every fixture differs from what its probe captured in only two kinds of place:

- `user_email` — replaced with the placeholder `user@example.com` (Cursor only carries this
  field).
- Every absolute path — the real home-directory or scratchpad-tmp prefix replaced with
  `/home/user/probe/...` (or, for a Cursor `transcript_path`, `/home/user/.cursor/...`),
  keeping the path **shape** intact. This includes paths that appear twice inside one
  payload, such as `cursor-post-tool-use.json`'s `tool_input.file_path` and its duplicate
  inside `tool_output`.

Detection reads `cursor_version`, `sessionId` (Copilot) / `session_id` (every other host), and
the `/projects/` versus `/sessions/` segments of `transcript_path` — none of which the
redaction touches.

## Hosts declared vs. hosts that currently write

All four hosts are declared in `lib/host.js`'s `DECLARED_HOSTS` and `lib/record.js`'s per-host
tables — declaring a host's session-id spelling and export-side `vendor_field` is independent
of whether the journal writes for it today:

- **Copilot** never carries `hook_event_name` in any captured payload, and nothing in this
  repository yet supplies a resolvable event name for it via argv either (see plan.md and
  issue #681). `resolveEventName` therefore returns `null` for a real Copilot payload, and
  `journal.js` writes nothing — not because Copilot is undeclared, but because no event is
  resolvable. Once #681 lands (framework-side, outside `hooks/`) and supplies a decidable
  event, this stops being true for real traffic; the frozen fixture replayed with no argv
  keeps resolving to nothing regardless, since that is a fact about the fixture, not about
  the defect.
- **Cursor** fires no `Stop`-equivalent hook when run headless (`sessionEnd` arrives instead,
  and is not mapped to `turn-end` — see issue #680); its `SessionStart`-equivalent still
  writes normally. `vendor_field` is `null` for Cursor specifically because its telemetry
  export itself is unmeasured (an Enterprise team setting), not because of either open issue.
  Cursor's own payload carries no `cwd` at all, only `workspace_roots` (a multi-root
  workspace can list several, not all of them git repositories) — `lib/repo.js`'s
  `readCwd`/`CWD_READER_BY_HOST` resolves the first entry that actually is one, the same way
  `lib/record.js`'s `readSessionId` resolves Cursor's differently-spelled session id.
