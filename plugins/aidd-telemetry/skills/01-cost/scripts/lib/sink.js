// Where normalised records are kept: one append-only file per UTC day, never rewritten.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCHEMA_VERSION = 2;
const DAY_KEY_LENGTH = "YYYY-MM-DD".length;
const PRIVATE_FILE_MODE = 0o600;

function legacyRootDir(home) {
  return path.join(home, ".config", "aidd", "telemetry");
}

function hasLegacyData(dir) {
  try {
    return fs.readdirSync(dir).some((entry) => entry.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

// `%APPDATA%` is where a Windows application puts this, not `.config` (measured on a real
// windows-latest runner, #707: `HOME`/`os.homedir()` both land at `.config\aidd`, which
// nothing on Windows expects to find). A machine that already journalled under that old
// default keeps landing there - not silently losing access to what it already wrote -
// only a machine starting fresh gets `%APPDATA%`.
function windowsRootDir(home) {
  const legacy = legacyRootDir(home);
  if (hasLegacyData(legacy)) return legacy;
  return process.env.APPDATA ? path.join(process.env.APPDATA, "aidd", "telemetry") : legacy;
}

function computeRootDir() {
  if (process.env.AIDD_USER_CONFIG_DIR) return path.join(process.env.AIDD_USER_CONFIG_DIR, "telemetry");
  const home = process.env.HOME || os.homedir();
  return process.platform === "win32" ? windowsRootDir(home) : legacyRootDir(home);
}

// Memoised per process: every caller below (dayFiles, readDayFile, append) calls rootDir()
// on its own, and the legacy-data probe above is real I/O that must answer the same way
// for the life of one run rather than drifting the moment the first file gets written.
let cachedRootDir = null;

function rootDir() {
  if (cachedRootDir === null) cachedRootDir = computeRootDir();
  return cachedRootDir;
}

// The journal's `mode` option is the identical no-op on Windows (#707,
// hooks/lib/repo.js) - `mkdirSync`/`appendFileSync` accept 0700/0600 without error and do
// nothing with it. `icacls` is the mechanism that actually restricts a path there,
// duplicated rather than required from hooks/lib/repo.js since this script ships inside a
// skill, installed independently of hooks/, and has to bring everything it needs itself.
// Skipped entirely when `AIDD_USER_CONFIG_DIR` is set: the README documents pointing it at
// a directory a team shares, and locking that down to one account would break exactly the
// sharing it exists for - a user who names their own location keeps responsibility for it.
// `%APPDATA%` itself is already the current OS user's own profile, unlike a git checkout
// that can sit anywhere, so restricting it to that same account narrows nothing that
// Windows' own convention did not already imply.
function restrictToCurrentUser(target, { recursive = false } = {}) {
  try {
    const owner = process.env.USERDOMAIN
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : process.env.USERNAME || os.userInfo().username;
    if (!owner) return;
    const grant = recursive ? `${owner}:(OI)(CI)F` : `${owner}:F`;
    const args = [target, "/inheritance:r", "/grant:r", grant];
    if (recursive) args.push("/T");
    args.push("/C", "/Q");
    spawnSync("icacls", args, { encoding: "utf8" });
  } catch {
    // icacls missing, no resolvable owner, or a domain-policy refusal: leave it as it is.
  }
}

function tightenFiguresDir(dir) {
  if (process.env.AIDD_USER_CONFIG_DIR) return;
  if (process.platform === "win32") restrictToCurrentUser(dir, { recursive: true });
}

// `/T` on the directory does not reliably carry the grant onto a leaf file it walks into
// (measured on a real windows-latest runner, #707), so a day file gets its own pass too -
// only the append that creates it, the one write `PRIVATE_FILE_MODE` itself only applies to.
function tightenFiguresFile(filePath) {
  if (process.env.AIDD_USER_CONFIG_DIR) return;
  if (process.platform === "win32") restrictToCurrentUser(filePath, { recursive: false });
}

function dayKey(date) {
  return date.toISOString().slice(0, DAY_KEY_LENGTH);
}

function dayFiles() {
  try {
    return fs
      .readdirSync(rootDir())
      .filter((entry) => entry.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
}

/** A line that does not parse, or carries a version this build does not know, is skipped
 * and counted. One torn final line from a concurrent write must not cost a whole day. */
function readDayFile(fileName) {
  let content;
  try {
    content = fs.readFileSync(path.join(rootDir(), fileName), "utf8");
  } catch {
    return { records: [], skipped: 0 };
  }
  const records = [];
  let skipped = 0;
  for (const raw of content.split("\n")) {
    if (raw.trim() === "") continue;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && parsed.sink_schema_version === SCHEMA_VERSION) records.push(parsed);
    else skipped += 1;
  }
  return { records, skipped };
}

function append(record, at) {
  const dir = rootDir();
  fs.mkdirSync(dir, { recursive: true });
  tightenFiguresDir(dir);
  const filePath = path.join(dir, `${dayKey(at)}.jsonl`);
  const fileIsNew = !fs.existsSync(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { mode: PRIVATE_FILE_MODE });
  if (fileIsNew) tightenFiguresFile(filePath);
}

function readForVendor(vendorId) {
  const records = [];
  for (const fileName of dayFiles()) {
    for (const record of readDayFile(fileName).records) {
      if (record.vendor_id === vendorId) records.push(record);
    }
  }
  return records;
}

/** The UTC day a record's own moment falls on, or nothing when it carries none. ISO with a
 * `Z` offset is what every producer writes, so the first ten characters are already the
 * day; anything else is parsed, so a non-UTC offset still lands on the day it happened. */
function recordDayKey(record) {
  const at = record.event_timestamp;
  if (typeof at !== "string") return null;
  if (at.length >= DAY_KEY_LENGTH && at.endsWith("Z")) return at.slice(0, DAY_KEY_LENGTH);
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : dayKey(parsed);
}

/** Every value a filterable field has ever carried, gathered across every day file this
 * sweep already opens - not only the period's own records. A filter's "known" side reads
 * this rather than a second pass: telling a project nobody ever worked in apart from one
 * that simply had no work in this period is only cheap because the bytes are already in
 * hand. */
function noteKnownValues(known, record) {
  if (typeof record.project_id === "string") known.projects.add(record.project_id);
  if (typeof record.step === "string") known.steps.add(record.step);
  if (typeof record.model === "string") known.models.add(record.model);
}

/**
 * Every record whose own moment falls in an inclusive range of UTC days.
 *
 * Every day file is opened, not only the ones the range names: a session read days after
 * it ran is appended to today's file while its records carry their own, older moments, so
 * the file name says when we heard about the work rather than when it happened.
 *
 * A record with no moment belongs to no period and comes back separately - the only other
 * moment available is the day the line was appended, which is a different fact.
 */
function readPeriod(fromDay, toDay) {
  const records = [];
  const undated = [];
  let skipped = 0;
  const projects = new Set();
  const steps = new Set();
  const models = new Set();
  for (const fileName of dayFiles()) {
    const read = readDayFile(fileName);
    skipped += read.skipped;
    for (const record of read.records) {
      if (record.project_id !== undefined) projects.add(record.project_id);
      if (record.step !== undefined) steps.add(record.step);
      if (record.model !== undefined) models.add(record.model);
      const key = recordDayKey(record);
      if (key === null) undated.push(record);
      else if (key >= fromDay && key <= toDay) records.push(record);
    }
  }
  return { records, undated, skipped, known: { projects, steps, models } };
}

module.exports = { SCHEMA_VERSION, append, readForVendor, readPeriod, rootDir };
