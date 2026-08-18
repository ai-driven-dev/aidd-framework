// Claude Code and Codex hand a SessionStart hook the same five keys, so the
// host is read from transcript_path's shape, never from field names. It also
// cannot be read from the environment: a Codex session launched from inside
// a Claude Code session inherits CLAUDECODE and CLAUDE_CODE_SESSION_ID from
// its parent.
const CODEX_TRANSCRIPT_PATTERN = /\/sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-/u;
const CLAUDE_CODE_TRANSCRIPT_PATTERN = /\/projects\/.*\.jsonl$/u;

// Windows delivers transcript_path with "\" throughout; both patterns above assume "/".
function normalizeSeparators(value) {
  return value.replace(/\\/gu, "/");
}

function detectHost(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (Object.prototype.hasOwnProperty.call(payload, "cursor_version")) {
    return "cursor";
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "sessionId") &&
    !Object.prototype.hasOwnProperty.call(payload, "hook_event_name")
  ) {
    return "copilot";
  }

  if (typeof payload.transcript_path === "string") {
    const transcriptPath = normalizeSeparators(payload.transcript_path);
    // Codex checked first: both hosts' transcript_path end in .jsonl, and
    // only the /sessions/ vs /projects/ segment tells them apart.
    if (CODEX_TRANSCRIPT_PATTERN.test(transcriptPath)) return "codex";
    if (CLAUDE_CODE_TRANSCRIPT_PATTERN.test(transcriptPath)) return "claude-code";
  }

  return null;
}

module.exports = { detectHost, normalizeSeparators };
