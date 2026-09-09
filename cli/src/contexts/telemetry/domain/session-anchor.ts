/** Which environment variable names the session running this process. Codex first: a Codex
 * process nested inside a Claude Code session inherits `CLAUDE_CODE_SESSION_ID`, a false
 * anchor naming the enclosing session. The order is what the plugin's own `session-anchor.cjs`
 * measured before it was deleted; no other host was probed, so no other host reads an anchor. */
export function resolveSessionAnchor(env: NodeJS.ProcessEnv): string | undefined {
  return env.CODEX_THREAD_ID || env.CLAUDE_CODE_SESSION_ID;
}
