// record.js - the run log itself: minting a run_id, naming and finding its
// file, and appending session_start / turn_end lines. Every write is one
// line ended with "\n"; nothing here reads a run file back in order to write
// it again - findRunFileByVendorId matches on the directory listing alone.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  sanitizePathSegment,
  resolveRunsDir,
  resolveWriteTarget,
  tightenOwnedDir,
  PRIVATE_DIR_MODE,
} = require("./repo.js");

// `aidd framework build` copies hooks/ verbatim into every user project with
// no install step, so this plugin can have no dependencies - hence a
// hand-rolled ULID (a 48-bit millisecond timestamp plus 80 bits of
// randomness, both Crockford base32) instead of one pulled from a package.

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
  // One byte per output character: simpler than exact bit-packing, and
  // unbiased anyway because 256 is a multiple of 32.
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

// `<run_id>__<vendor_id>.jsonl`, vendor_id sanitised as a path segment. A
// JSON object is a closed block that can only be rewritten whole; a
// line-per-object file can be appended to, which is the entire point of this
// shape (see plan.md).
const RUN_FILE_EXTENSION = ".jsonl";

function runFileName(runId, vendorId) {
  return `${runId}__${sanitizePathSegment(String(vendorId))}${RUN_FILE_EXTENSION}`;
}

// Splits on the fixed ULID_LENGTH rather than searching for "__", since a
// sanitised vendor_id may itself contain "__".
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

// Matches on the directory listing alone - no file read, no JSON parse -
// since turn-end and file-written both call this on every event. This is
// what lets findRunFileByVendorId scan directory *names* without that
// counting as reading a run file in order to write it again.
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

// Moved from 1: the mutable ten-key record it described is gone, replaced by
// this append-only line log. Recorded once, on session_start, so a reader
// can tell which shape a given file is without inspecting every line.
const SCHEMA_VERSION = 2;

// Which export-side attribute vendor_id can be joined against, per host.
const VENDOR_FIELD_BY_HOST = Object.freeze({
  "claude-code": "session.id",
});

const PRIVATE_FILE_MODE = 0o600;

// The only write primitive in this file: one line, appended. `mode` only
// takes effect when the append call is the one that creates the file (the
// session_start line always is, since SessionStart mints the file), matching
// writeRecord's old guarantee that the file never lands world-readable.
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

// prompt_id is omitted, never written as null, when the payload carries none
// - no host observed today does, but the field stays a first-class part of
// the shape for one that does.
function buildTurnEndLine({ at, promptId }) {
  const line = { type: "turn_end", at };
  if (typeof promptId === "string" && promptId !== "") line.prompt_id = promptId;
  return line;
}

// path is repository-relative and "/"-separated on every platform (see
// file-writes.js's taskFolderRelativePath) - never a task_id, which is a
// derivation that belongs to the reader, not the writer.
function buildFileWrittenLine({ at, path: writtenPath }) {
  return { type: "file_written", at, path: writtenPath };
}

function handleSessionStart(payload, host) {
  const target = resolveWriteTarget(payload.cwd);
  if (!target) return;
  const { projectId, projectRemote, dir } = target;

  // SessionStart is not documented to fire only once per session_id
  // (`source` takes values beyond `startup`), so this guard prevents a
  // second file - and a duplicate session_start line - for one vendor_id
  // outright.
  if (findRunFileByVendorId(dir, payload.session_id)) return;

  const runId = generateUlid();
  const line = buildSessionStartLine({
    at: nowIso(),
    runId,
    projectId,
    projectRemote,
    host,
    vendorId: payload.session_id,
  });

  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  appendLine(path.join(dir, runFileName(runId, payload.session_id)), line);
  tightenOwnedDir(dir);
}

// Driven by Stop, not a session-end event: Codex grants a session-end
// handler one second at most and does not fire it for subagents at all, so
// the last observed turn-end is the only reliable end.
function handleTurnEnd(payload) {
  const target = resolveRunsDir(payload.cwd);
  if (!target) return;
  const { dir } = target;

  const filePath = findRunFileByVendorId(dir, payload.session_id);
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
  appendLine,
  buildSessionStartLine,
  buildTurnEndLine,
  buildFileWrittenLine,
  PRIVATE_FILE_MODE,
  handleSessionStart,
  handleTurnEnd,
};
