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

## Copilot's event log is not a payload capture

Copilot writes `~/.copilot/session-state/<id>/events.jsonl`, and each `hook.start` line
carries an `input` object. It is tempting to read that as "the payload the hook received",
which would make capturing a shape free — no session to run, no tokens to spend.

**It is not the same object, and reading it that way produces a fixture of a shape no hook
ever sees.** In `@github/copilot`'s own bundle, the log line is emitted once per *event*,
from a hard-coded literal, before the per-hook payload builder runs. The `preToolUse` site
shows both objects a few statements apart:

```js
// what gets logged
emitHookStart({ hookInvocationId: r, hookType: "preToolUse",
                input: { sessionId, cwd, toolCalls: e.toolCalls.map(...) } })
// what a hook is handed
{ timestamp: Date.now(), cwd: this.workingDir, toolName: u, toolArgs: d }
```

Different keys for the same event, and the hook-facing one carries `timestamp` while the
logged one does not.

The consequence that matters here: **the log always shows the canonical camelCase spelling,
whichever builder the hook actually gets.** The `_vsCodeCompat` rewrite documented above is
selected per hook declaration, after the log line is written.

That is not a hypothetical for this plugin. `plugins/aidd-telemetry/hooks/hooks.json`
declares `SessionStart`, `PostToolUse` and `Stop` — PascalCase, which is exactly what
triggers the rewrite. So **this framework's own hooks receive the compat snake_case payload**
while Copilot's event log records their events in camelCase. Counting spellings in that log
cannot tell the two builders apart, and a count of zero snake_case there is not evidence that
snake_case never arrives. The compat fixtures above are the direct counter-evidence: captured
from a hook's own stdin on 1.0.80, running this plugin, carrying `session_id` and
`hook_event_name`.

Read hook declarations from the plugin, not from whatever else is installed on the machine.
`~/.copilot/hooks/` can hold files belonging to other applications entirely, and their event
casing says nothing about this one.

Read on the readable `@github/copilot` 1.0.57 bundle. The 1.0.80 runtime binary is packed —
`strings` finds no `_vsCodeCompat`, `hookInvocationId` or `hook.start` in it — so the
architecture is proven on 1.0.57 and corroborated on 1.0.80 only by the stdin captures
above. Nothing here settles what 1.0.80 does differently, if anything.

**So a Copilot shape fixture costs a session.** That session was run on 2026-08-28, against
`@github/copilot` 1.0.80, in a throwaway project declaring this plugin's own PascalCase
events with the hook command replaced by one that dumps stdin verbatim. What it settled:

- **All five events arrive in the compat snake_case shape.** `session_id`,
  `hook_event_name`, `tool_name`, `tool_input`, `initial_prompt`, `stop_reason`. Not one
  camelCase `sessionId` on stdin — the exact opposite of what the event log showed for the
  same events, which is the trap this section exists to name.
- **The three compat fixtures already here are faithful.** Their key sets were compared
  against that stdin and match exactly. That had been assumed since 2026-08-21; it is now
  measured.
- **Two shapes had never been captured**, and are added from this session:
  `copilot-compat-user-prompt-submitted.json` and `copilot-compat-pre-tool-use-skill.json`.
- **`timestamp` is an ISO string on stdin**, where the event log records an integer. One
  more place the two objects differ.
- **The compat builder renames built-in tools to Claude Code's PascalCase spelling but
  leaves `skill` lowercase.** The same session captured `tool_name: "Read"` for a file read
  and `tool_name: "skill"` for the skill call. `STEP_START_BY_HOST.copilot` keys on that
  lowercase spelling, so the asymmetry is load-bearing rather than cosmetic.
- **The chain writes.** Those payloads through `journal.cjs` produce `session_start` (with
  `vendor_id` equal to the session id Copilot itself printed), `step_start` naming the
  skill, and `turn_end`.

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

## OpenCode's two plugin events

`opencode-session-idle.json` and `opencode-session-created.json` are not hook payloads —
OpenCode's plugin surface hands `hooks/opencode-plugin.js` a JS event object in-process,
never a stdin JSON payload the way every other host's hook does. The two carry different
weight.

- **`opencode-session-idle.json`** is a real, live capture: `opencode 1.14.20` running
  `opencode run` (`opencode/big-pickle`), 2026-08-31. `sessionID` is the only field the
  event carries, matching `@opencode-ai/sdk`'s own `EventSessionIdle` type exactly — it
  names the session, and nothing about where it ran. Synthesised: `sessionID`'s value only.
- **`opencode-session-created.json`** is *not* a delivery capture, and this entry is
  the only place that gap is stated for it as bluntly as it needs to be: **`session.created`
  was never observed reaching the plugin's own `event` hook.** One live `opencode 1.14.20`
  run (`opencode run`, `opencode/big-pickle`, 2026-08-31, started with `--print-logs`) is the
  measurement this rests on: the plugin's `event` hook demonstrably fired for roughly 38
  events of other types in that run (`session.updated`, `session.status`, `message.updated`
  and others, written to a real `captured-events.jsonl`), the run's own log shows
  `service=plugin path=…capture.js loading` followed later by
  `service=bus type=session.created publishing`, and `session.created` never appears among
  the captured events despite that publish line. That is the discriminating run - it is the
  only one with debug logging turned on, so it is the only one that can distinguish
  "never published" from "published but not delivered."

  Two further attempts neither confirm nor refute it, and are named here only so the count
  is not inflated: a second `opencode run` without `--print-logs` also captured no
  `session.created`, but with no log to show whether one was ever published, so it adds
  nothing beyond the first; a bare `POST /session` API call captured zero plugin events of
  any type in that run, so it says nothing about `session.created` specifically. This is not
  a new defect - the plugin README already named it (`README.md`, "OpenCode misses a server
  process's first session, and `opencode run` is always a first session") - this capture is
  the first evidence behind that sentence rather than a doc comment asserting it.

  The fixture's shape rests on two things that *are* verified: `@opencode-ai/sdk@` (the
  version opencode 1.14.20 ships) declares `EventSessionCreated` as
  `{ type: "session.created", properties: { info: Session } }` - byte-identical to
  `EventSessionUpdated`'s own declared shape - and a `session.updated` event *was* captured
  live in the same run, carrying a real `info` object with this exact key set (`id`, `slug`,
  `projectID`, `directory`, `title`, `version`, `permission`, `time.created`,
  `time.updated`). The fixture is that real `info` shape, re-wrapped under the type the SDK
  declares for creation. Every value in it is synthesised. Treat it as a shape derived from
  a verified type declaration plus a genuine sibling capture, not as a recording of
  `session.created` actually arriving - because it never did.
