// Claude Code and Codex hand a SessionStart hook the same five keys, so the host is read
// from transcript_path's shape. Not from the environment either: a Codex session launched
// inside a Claude Code session inherits that session's own variables.
const CODEX_TRANSCRIPT_PATTERN = /\/sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-/u;
const CLAUDE_CODE_TRANSCRIPT_PATTERN = /\/projects\/.*\.jsonl$/u;

// Windows delivers transcript_path with "\" throughout; both patterns above assume "/".
function normalizeSeparators(value) {
  return value.replace(/\\/gu, "/");
}

// Which field carries a path differs by host and by tool, so every string is walked. Neutral
// about whose payload it is walking.
function* stringsWithin(value) {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) yield* stringsWithin(nested);
}

// A further host becomes one more entry here, never a branch in the dispatcher: detectHost
// stays the only place deciding which host a payload came from.
const DECLARED_HOSTS = new Set(["claude-code", "codex", "copilot", "cursor", "opencode"]);

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

  // Copilot's other payload shape, which reuses Claude Code's own event spelling verbatim.
  // Told apart by `timestamp`, a field neither Claude Code nor Codex carries, and checked
  // after their transcript_path patterns so a host carrying one is claimed by its own shape.
  if (
    Object.prototype.hasOwnProperty.call(payload, "timestamp") &&
    Object.prototype.hasOwnProperty.call(payload, "hook_event_name") &&
    Object.prototype.hasOwnProperty.call(payload, "session_id")
  ) {
    return "copilot";
  }

  // OpenCode alone names itself, checked last: every shape above was reverse-engineered from
  // a payload nobody here controls, so a self-declared "tool" field only wins once none of
  // them matched. OpenCode has no hook payload at all - opencode-plugin.js builds this one.
  if (payload.tool === "opencode") return "opencode";

  return null;
}

module.exports = { detectHost, normalizeSeparators, stringsWithin, DECLARED_HOSTS };
