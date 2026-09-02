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

// Every string reachable inside a payload value, walked because which field carries a
// path differs by host and by tool - a skill's SKILL.md path, a declared task path. Neutral
// like normalizeSeparators above: what it walks, not which host's payload it is walking.
function* stringsWithin(value) {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) yield* stringsWithin(nested);
}

// The complete set of hosts journal.cjs will write for. A fifth host becomes one more
// entry here, never a branch in the dispatcher - detectHost above stays the only place
// that decides which host a payload came from; this only decides whether that host is
// one the journal acts on yet.
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

  // Copilot's other payload shape: its plugin loader stamps a PascalCase-named
  // hook `_vsCodeCompat` and switches to a second builder that reuses Claude
  // Code's own event spelling verbatim (session_id, hook_event_name) instead of
  // sessionId. Told apart from Claude Code and Codex by `timestamp`, a field
  // neither of those ever carries, and checked only after their transcript_path
  // patterns above so a host that does carry one is claimed by its own shape
  // first. Measured 2026-08-21 against a real @github/copilot@1.0.80 session -
  // see scripts/__tests__/fixtures/copilot-compat-*.json.
  if (
    Object.prototype.hasOwnProperty.call(payload, "timestamp") &&
    Object.prototype.hasOwnProperty.call(payload, "hook_event_name") &&
    Object.prototype.hasOwnProperty.call(payload, "session_id")
  ) {
    return "copilot";
  }

  // OpenCode alone names itself, checked last: every shape above was reverse-engineered
  // from a captured payload nobody here controls, so a vendor host claims a payload it
  // matches first, and a self-declared "tool" field only wins once none of them did.
  // OpenCode has no hook payload at all - hooks/opencode-plugin.js builds this one itself,
  // from inside a JS plugin OpenCode loads in-process (see measurements.md, phase 5) - and
  // no captured fixture from any other host has ever carried a top-level "tool" key.
  if (payload.tool === "opencode") return "opencode";

  return null;
}

module.exports = { detectHost, normalizeSeparators, stringsWithin, DECLARED_HOSTS };
