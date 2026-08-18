# Fixtures: recorded hook payloads

One real, captured `SessionStart` hook payload per host: `claude-code-session-start.json`,
`codex-session-start.json`, `copilot-session-start.json`, `cursor-session-start.json`.

Four real, captured Claude Code `PostToolUse` payloads, one per observed tool:
`claude-code-post-tool-use-write.json`, `-edit.json`, `-notebook-edit.json` (the three tools
that write; `Write`/`Edit` carry `tool_input.file_path`, `NotebookEdit` carries
`tool_input.notebook_path` instead), and `-bash.json` (a non-write tool, captured to prove the
tool-name whitelist actually rejects something rather than never being exercised).

These are recordings, not hand-written examples — a hand-written fixture would encode the
assumption being tested rather than what a host actually sends.

## Redaction

Each file differs from what the probe captured in exactly two places, and nothing else:

- `user_email` (Cursor only) — replaced with the placeholder `user@example.com`.
- The home-directory prefix of every absolute path — replaced with `/home/user`, keeping the
  path **shape** intact (the shape is what host detection reads).

Detection reads `cursor_version`, `sessionId`, and the `/projects/` versus `/sessions/`
segments of `transcript_path` — none of which the redaction touches.
