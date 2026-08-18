// record.js - the run record itself: minting a run_id, naming and finding
// its file, building the ten-key shape, and reading/writing it back to disk.

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

// `<run_id>__<vendor_id>.json`, vendor_id sanitised as a path segment.
function runFileName(runId, vendorId) {
  return `${runId}__${sanitizePathSegment(String(vendorId))}.json`;
}

// Splits on the fixed ULID_LENGTH rather than searching for "__", since a
// sanitised vendor_id may itself contain "__".
function parseRunFileName(entry) {
  if (!entry.endsWith(".json")) return null;
  if (entry.length <= ULID_LENGTH + "__".length + ".json".length) return null;
  if (entry.slice(ULID_LENGTH, ULID_LENGTH + 2) !== "__") return null;
  return {
    runId: entry.slice(0, ULID_LENGTH),
    vendorSegment: entry.slice(ULID_LENGTH + 2, -".json".length),
  };
}

// Matches on the directory listing alone - no file read, no JSON parse -
// since turn-end and file-written both call this on every event.
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

const SCHEMA_VERSION = 1;

// Which export-side attribute vendor_id can be joined against, per host.
const VENDOR_FIELD_BY_HOST = Object.freeze({
  "claude-code": "session.id",
});

// tasks opens as a single unattached interval; file-written replaces or
// extends it once path evidence arrives (see attach.js).
function buildRecord({ host, runId, projectId, vendorId, startedAt }) {
  return {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: projectId,
    tool: host,
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD_BY_HOST[host],
    parent_run_id: null,
    started_at: startedAt,
    ended_at: startedAt,
    tasks: [{ task_id: null, from: startedAt, to: null }],
  };
}

function readRecord(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const PRIVATE_FILE_MODE = 0o600;

function writeRecord(filePath, record) {
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { mode: PRIVATE_FILE_MODE });
}

function handleSessionStart(payload, host) {
  const target = resolveWriteTarget(payload.cwd);
  if (!target) return;
  const { projectId, dir } = target;

  // SessionStart is not documented to fire only once per session_id
  // (`source` takes values beyond `startup`), so this guard prevents a
  // second file for one vendor_id outright.
  if (findRunFileByVendorId(dir, payload.session_id)) return;

  const runId = generateUlid();
  const startedAt = nowIso();
  const record = buildRecord({ host, runId, projectId, vendorId: payload.session_id, startedAt });

  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  writeRecord(path.join(dir, runFileName(runId, payload.session_id)), record);
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

  const record = readRecord(filePath);
  record.ended_at = nowIso();
  writeRecord(filePath, record);
}

module.exports = {
  generateUlid,
  ULID_LENGTH,
  nowIso,
  runFileName,
  parseRunFileName,
  findRunFileByVendorId,
  SCHEMA_VERSION,
  VENDOR_FIELD_BY_HOST,
  buildRecord,
  readRecord,
  writeRecord,
  PRIVATE_FILE_MODE,
  handleSessionStart,
  handleTurnEnd,
};
