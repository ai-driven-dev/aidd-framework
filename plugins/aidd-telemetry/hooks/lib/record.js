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
  tightenOwnedFile,
  PRIVATE_DIR_MODE,
} = require("./repo.js");
const { TOOLS_BY_HOST, readCwd, readSessionId } = require("./tools/index.js");

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

// Which export-side attribute vendor_id can be joined against, per host - each host's own
// hooks/lib/tools/<host>.js states it, measured or explicitly null; this is that fact
// gathered into the one shape buildSessionStartLine below already expects.
const VENDOR_FIELD_BY_HOST = Object.freeze(
  Object.fromEntries(
    Object.entries(TOOLS_BY_HOST).map(([host, tool]) => [host, tool.vendorField])
  )
);

// codexSessionIdFromTranscriptPath and readSessionId(host, payload) live in
// hooks/lib/tools/ now (codex.js and tools/index.js respectively) and are re-exported
// below unchanged - CLI tests reach them by exactly these names (see
// cli/tests/helpers/telemetry-journal-hook.ts).
const { codexSessionIdFromTranscriptPath } = require("./tools/codex.js");

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

// A start, told rather than inferred, the same way step_start is: a tool call named a task
// path, so this session is on that task from here. No end on this line either, and for the
// same reason step_start carries none - closing is the reader's derivation, from whichever
// turn_end or later task_declared comes next (see report.js's buildTaskIntervals). path is
// repository-relative like file_written's, never a task_id: the derivation belongs to the
// reader.
function buildTaskDeclaredLine({ at, path: declaredPath }) {
  return { type: "task_declared", at, path: declaredPath };
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
  const filePath = path.join(dir, runFileName(runId, sessionId));
  appendLine(filePath, line);
  tightenOwnedDir(dir);
  tightenOwnedFile(filePath);
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

// A payload's session is only readable behind a known host's own spelling
// (readSessionId above), so an unrecognised one has no session and therefore no run file
// to append to; it lands in one file shared by the whole repo instead, named so it can
// never collide with `<runId>__<vendorId>.jsonl`.
const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";

// Overwritten, not appended: journal.js already keeps this off the tool-used path (the
// git-shellout gate), so this only ever runs once per session-start or turn-end - but it
// still stays at exactly one line however many of those arrive, and `at` is always the
// most recent one rather than freezing on the first. A marker that never moved forward
// would recreate the stale-forever diagnosis this whole change removed from `hook fired`.
function handleUnrecognisedPayload(payload) {
  // An unrecognised payload's own shape is, by definition, unknown - it may spell its
  // working directory differently, or carry none at all (Cursor already does this among
  // declared hosts), so payload.cwd is used only when it looks usable. process.cwd()
  // falls back: a hook always runs inside the project it measures, which is a fact about
  // where this process runs, not a guess about the payload. Which of the two produced a
  // given marker is not recorded, since it does not change the answer.
  const cwd = payload && typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const target = resolveRunsDir(cwd);
  if (!target) return;

  fs.mkdirSync(target.dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  const filePath = path.join(target.dir, UNRECOGNISED_FILE_NAME);
  const line = `${JSON.stringify({ type: "unrecognised_payload", at: nowIso() })}\n`;
  fs.writeFileSync(filePath, line, { mode: PRIVATE_FILE_MODE });
  tightenOwnedDir(target.dir);
  tightenOwnedFile(filePath);
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
  codexSessionIdFromTranscriptPath,
  readSessionId,
  appendLine,
  buildSessionStartLine,
  buildTurnEndLine,
  buildFileWrittenLine,
  buildStepStartLine,
  buildTaskDeclaredLine,
  sanitizeSkillName,
  PRIVATE_FILE_MODE,
  handleSessionStart,
  handleTurnEnd,
  UNRECOGNISED_FILE_NAME,
  handleUnrecognisedPayload,
};
