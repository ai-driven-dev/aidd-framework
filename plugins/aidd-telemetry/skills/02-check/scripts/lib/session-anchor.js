// Which environment variable, if any, names the session actually running this script -
// the anchor "hook fired" needs to tell a genuinely dead hook from one that simply
// predates this check. Each variable read here was read because a live probe measured it,
// never because a host was assumed to behave like another: recorded in
// aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/measurements.md under "Per-tool
// session anchor, measured live".
//
// - CODEX_THREAD_ID: measured in the environment of a shell command Codex ran under
//   --dangerously-bypass-approvals-and-sandbox and --skip-git-repo-check, deliberately
//   WITHOUT --dangerously-bypass-hook-trust - the untrusted, trust-gated case this anchor
//   exists to cover, confirmed with no run journal written and no [hooks.state...] entry in
//   config.toml. Present there too: `env | grep -i codex` inside the shell command showed
//   CODEX_THREAD_ID set to that session's own id, and running the skill's own
//   telemetry-check.js (not just the raw shell) against that same id read Codex's trust
//   state and produced "Codex has not trusted this plugin's hook", not the generic
//   never-fired claim - both gaps the earlier caveat here left open. It matched both the
//   session id Codex printed at startup and the rollout filename `record.js` already parses
//   into a Codex `vendor_id`, so it joins the journal without translation. Confirmed NOT
//   inherited from the launching shell - `env | grep CODEX_THREAD_ID` in the parent found
//   nothing, so Codex set it itself.
// - CLAUDE_CODE_SESSION_ID: Claude Code sets it the same way, but `hooks/lib/host.js`
//   already measured that a Codex process nested inside a Claude Code session inherits
//   this one from its parent - a false anchor there, naming the enclosing session rather
//   than the one actually running.
//
// Codex's variable is checked first for exactly that reason: when both are set, that IS
// the nested case, and CODEX_THREAD_ID is the one that names the process actually
// running, so it wins unconditionally rather than through a separate nested-case branch.
//
// No third variable is read here. Copilot and Cursor were not probed this way, so a host
// other than these two reads no anchor because nothing was measured for it, not because
// nothing exists.
function resolveSessionAnchor(env) {
  return env.CODEX_THREAD_ID || env.CLAUDE_CODE_SESSION_ID;
}

// Same two variables, same precedence, naming which tool set the one that matched - the
// export-route claims (export-config.js) need to know whose settings to read, independent
// of whether the run journal itself ever gets read: a tool this returns is one of the only
// two ever measured this way, so it is also the only two export-config.js has any business
// reading. Spelled to match TOOLS[].tool (readers.js) directly, "claude" not "claude-code" -
// picking one spelling at this one boundary rather than translating it again downstream.
function resolveCurrentTool(env) {
  if (env.CODEX_THREAD_ID) return "codex";
  if (env.CLAUDE_CODE_SESSION_ID) return "claude";
  return undefined;
}

module.exports = { resolveSessionAnchor, resolveCurrentTool };
