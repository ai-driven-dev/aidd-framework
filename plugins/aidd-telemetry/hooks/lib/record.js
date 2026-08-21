// The run log itself: minting a run_id, naming and finding its file, and appending
// session_start / turn_end lines. Every write is one line; nothing here reads a run file
// back in order to write it again.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  sanitizePathSegment,
  resolveRunsDir,
  resolveWriteTarget,
  tightenOwnedDir,
  PRIVATE_DIR_MODE,
  readCwd,
} = require("./repo.js");

// Hand-rolled ULID - 48-bit millisecond timestamp plus 80 bits of randomness, both
// Crockford base32 - since this plugin ships with no dependencies.

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 symbols, 5 bits each; no I/L/O/U.

function encodeTime(time, length) {
  let chars = "";
  let remaining = time;
  for (let i = 0; i < length; i++) {
    const mod = remaining % 32;
    chars = CROCKFORD_ALPHABET[mod] + chars;
    remaining = (remaining - mod) / 32;
  }
  return chars;
}

function encodeRandom(length) {
  // One byte per character: unbiased because 256 is a multiple of 32.
  const bytes = crypto.randomBytes(length);
  let chars = "";
  for (let i = 0; i < length; i++) {
    chars += CROCKFORD_ALPHABET[bytes[i] % 32];
  }
  return chars;
}

function generateUlid(now = Date.now()) {
  return encodeTime(now, 10) + encodeRandom(16);
}

const ULID_LENGTH = 10 + 16; // encodeTime(10) + encodeRandom(16), kept in step with generateUlid.

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

// `<run_id>__<vendor_id>.jsonl`. A JSON object is a closed block that can only be
// rewritten whole; a line-per-object file can be appended to.
const RUN_FILE_EXTENSION = ".jsonl";

function runFileName(runId, vendorId) {
  return `${runId}__${sanitizePathSegment(String(vendorId))}${RUN_FILE_EXTENSION}`;
}

// Splits on the fixed ULID_LENGTH rather than on "__", which a sanitised vendor_id may
// itself contain.
function parseRunFileName(entry) {
  if (!entry.endsWith(RUN_FILE_EXTENSION)) return null;
  const minLength = ULID_LENGTH + "__".length + RUN_FILE_EXTENSION.length;
  if (entry.length <= minLength) return null;
  if (entry.slice(ULID_LENGTH, ULID_LENGTH + 2) !== "__") return null;
  return {
    runId: entry.slice(0, ULID_LENGTH),
    vendorSegment: entry.slice(ULID_LENGTH + 2, -RUN_FILE_EXTENSION.length),
  };
}

// Matches on the directory listing alone - no file read, no JSON parse - since turn-end
// and file-written both call this on every event.
function findRunFileByVendorId(dir, vendorId) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const wanted = sanitizePathSegment(String(vendorId));
  for (const entry of entries) {
    const parsed = parseRunFileName(entry);
    if (parsed && parsed.vendorSegment === wanted) return path.join(dir, entry);
  }
  return null;
}

// Bumped from 1 when the mutable record became this append-only line log. Written once,
// on session_start, so a reader can tell a file's shape without scanning it.
const SCHEMA_VERSION = 2;

// Which export-side attribute vendor_id can be joined against, per host - measured, never
// guessed. `null` on Cursor is a fact, not a gap: its own telemetry export is itself
// unmeasured (an Enterprise team setting nobody here can turn on), so there is no
// attribute name to name. A documented-but-uncaptured guess would be exactly the false
// figure this layer exists to prevent.
const VENDOR_FIELD_BY_HOST = Object.freeze({
  "claude-code": "session.id", // CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE, measured 2026-08-13.
  codex: "conversation.id", // Measured 2026-08-13, on codex.sse_event.
  copilot: "gen_ai.conversation.id", // Measured 2026-08-13, on the invoke_agent span.
  cursor: null,
});

// A Codex rollout is named `rollout-<timestamp>-<uuid>.jsonl`, and that trailing uuid is
// the rollout's own `session_meta.id` - measured across every rollout on disk, including
// resumed ones where it differs from `session_meta.session_id`. The reader side resolves a
// Codex session on exactly this equality; see CODEX_ROLLOUT_LOCATION in
// cli/src/domain/formats/codex-rollout.ts, whose `matches` this mirrors. The two parses
// live apart because hooks/ is copied verbatim by the framework build and can import
// nothing from cli/ - the same reason sanitizePathSegment is duplicated - so
// tests/domain/formats/codex-rollout.unit.test.ts pins them to each other and turns red if
// either moves.
const CODEX_ROLLOUT_PREFIX = "rollout-";
const CODEX_ROLLOUT_EXTENSION = ".jsonl";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function codexSessionIdFromTranscriptPath(transcriptPath) {
  if (typeof transcriptPath !== "string" || transcriptPath === "") return undefined;
  const base = transcriptPath.split(/[\\/]/u).pop() || "";
  if (!base.startsWith(CODEX_ROLLOUT_PREFIX) || !base.endsWith(CODEX_ROLLOUT_EXTENSION)) {
    return undefined;
  }
  const stem = base.slice(0, -CODEX_ROLLOUT_EXTENSION.length);
  const candidate = stem.slice(-36);
  return UUID_PATTERN.test(candidate) && stem.length > 36 ? candidate : undefined;
}

// How each host names the session id in its own hook payload. journal.js used to read
// payload.session_id outright - one host's spelling, promoted to a rule. Copilot alone
// spells it sessionId; every other declared host agrees on session_id.
//
// Codex is the one host whose payload spelling cannot simply be trusted: 124 of 330
// rollouts on this machine are resumed sessions where `session_meta.session_id` holds the
// parent's identifier rather than the rollout's own, and a vendor_id written from the
// wrong one joins to nothing while the journal still looks healthy. Its payload carries
// `transcript_path` - measured 2026-08-21 from the serde field table shipped in the
// codex-cli 0.145.0 binary, `strings -n 4 <bin> | grep session_id`, which lists
// `session_id transcript_path hook_event_name reason permission_mode source turn_id
// agent_transcript_path agent_type last_assistant_message` - so the identity is derived
// from the rollout the session is actually writing, and the two sides agree by
// construction instead of by coincidence. `session_id` remains the fallback for a payload
// carrying no transcript path.
const SESSION_ID_READER_BY_HOST = Object.freeze({
  "claude-code": (payload) => payload.session_id,
  codex: (payload) =>
    codexSessionIdFromTranscriptPath(payload.transcript_path) ?? payload.session_id,
  copilot: (payload) => payload.sessionId,
  cursor: (payload) => payload.session_id,
});

function readSessionId(host, payload) {
  const reader = SESSION_ID_READER_BY_HOST[host];
  return reader ? reader(payload) : undefined;
}

const PRIVATE_FILE_MODE = 0o600;

// `mode` takes effect only on the append that creates the file, which the session_start
// line always is.
function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${JSON.stringify(line)}\n`, { mode: PRIVATE_FILE_MODE });
}

function buildSessionStartLine({ at, runId, projectId, projectRemote, host, vendorId }) {
  return {
    type: "session_start",
    at,
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: projectId,
    project_remote: projectRemote,
    tool: host,
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD_BY_HOST[host],
  };
}

// prompt_id is omitted, never written as null, when the payload carries none.
function buildTurnEndLine({ at, promptId }) {
  const line = { type: "turn_end", at };
  if (typeof promptId === "string" && promptId !== "") line.prompt_id = promptId;
  return line;
}

// path is repository-relative and "/"-separated on every platform. Never a task_id: that
// derivation belongs to the reader, not the writer.
// `source` says how the path came to be known, for the same reason step_attribution does:
// "tool-stated" is the path the host handed us, exact and with no false positive.
// "observed" is a file that changed inside a task folder while this session was running,
// which is how a write made through a shell command or an apply_patch becomes visible at
// all - and which can, in principle, catch a file something else on the machine wrote in
// the same window. A consumer that must not risk that filters on this field.
function buildFileWrittenLine({ at, path: writtenPath, source }) {
  return { type: "file_written", at, path: writtenPath, source };
}

// A start, and nothing else. No end, no duration, no parent: no tool exposes when a
// skill's work finishes, so all three would be a conclusion stored as a fact. The skill
// name is sanitised as a value, never as a path segment - it is a name here, not a
// location. turn_id is omitted, never written as null, when the host carries none.
function buildStepStartLine({ at, skill, turnId }) {
  const line = { type: "step_start", at, skill: sanitizeSkillName(skill) };
  if (typeof turnId === "string" && turnId !== "") line.turn_id = turnId;
  return line;
}

// Separators and traversal collapse to "-", so a hostile name cannot read as a path or
// escape its own field. Emptied entirely, it reads "-" rather than vanishing.
function sanitizeSkillName(skill) {
  const cleaned = String(skill).replace(/[^\w.:-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

// sessionId arrives already read behind the host declaration (see readSessionId above) -
// this function never assumes payload.session_id is that host's own spelling. The working
// directory is read the same way, behind readCwd - Cursor names it workspace_roots, never
// cwd (see hooks/lib/repo.js).
function handleSessionStart(payload, host, sessionId) {
  const target = resolveWriteTarget(readCwd(host, payload));
  if (!target) return;
  const { projectId, projectRemote, dir } = target;

  // SessionStart is not documented to fire once per session_id - `source` takes values
  // beyond `startup` - so this guard prevents a second file for one vendor_id.
  if (findRunFileByVendorId(dir, sessionId)) return;

  const runId = generateUlid();
  const line = buildSessionStartLine({
    at: nowIso(),
    runId,
    projectId,
    projectRemote,
    host,
    vendorId: sessionId,
  });

  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  appendLine(path.join(dir, runFileName(runId, sessionId)), line);
  tightenOwnedDir(dir);
}

// Driven by Stop, not a session-end event: Codex grants a session-end handler one second
// at most and does not fire it for subagents, so the last turn-end is the only reliable end.
function handleTurnEnd(payload, host, sessionId) {
  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;
  const { dir } = target;

  const filePath = findRunFileByVendorId(dir, sessionId);
  if (!filePath) return;

  appendLine(filePath, buildTurnEndLine({ at: nowIso(), promptId: payload.prompt_id }));
}

module.exports = {
  generateUlid,
  ULID_LENGTH,
  nowIso,
  RUN_FILE_EXTENSION,
  runFileName,
  parseRunFileName,
  findRunFileByVendorId,
  SCHEMA_VERSION,
  VENDOR_FIELD_BY_HOST,
  SESSION_ID_READER_BY_HOST,
  codexSessionIdFromTranscriptPath,
  readSessionId,
  appendLine,
  buildSessionStartLine,
  buildTurnEndLine,
  buildFileWrittenLine,
  buildStepStartLine,
  sanitizeSkillName,
  PRIVATE_FILE_MODE,
  handleSessionStart,
  handleTurnEnd,
};
