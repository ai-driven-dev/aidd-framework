/**
 * Which environment variable, if any, names the session actually running this process —
 * `aidd telemetry check`'s "hook fired" claim needs to tell a genuinely dead hook from one
 * that simply predates this check. Mirrors the plugin's own `session-anchor.cjs`, measured
 * live against real Codex and Claude Code sessions (see that file's own doc comment for
 * the measurements this is not free to re-derive).
 *
 * Codex's variable is checked first: a Codex process nested inside a Claude Code session
 * inherits `CLAUDE_CODE_SESSION_ID` from its parent, a false anchor that would name the
 * enclosing session rather than the one actually running. `CODEX_THREAD_ID` set at all
 * means this is a Codex process, whatever else it inherited.
 *
 * No third variable is read here. Copilot and Cursor were not probed this way, so a host
 * other than these two reads no anchor because nothing was measured for it, not because
 * nothing exists.
 */
export function resolveSessionAnchor(env: NodeJS.ProcessEnv): string | undefined {
  return env.CODEX_THREAD_ID || env.CLAUDE_CODE_SESSION_ID;
}
