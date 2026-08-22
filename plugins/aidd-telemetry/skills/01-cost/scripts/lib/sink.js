// Where normalised records are kept: one append-only file per UTC day, never rewritten.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCHEMA_VERSION = 2;
const DAY_KEY_LENGTH = "YYYY-MM-DD".length;
const PRIVATE_FILE_MODE = 0o600;

function rootDir() {
  const base =
    process.env.AIDD_USER_CONFIG_DIR ||
    path.join(process.env.HOME || os.homedir(), ".config", "aidd");
  return path.join(base, "telemetry");
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
  fs.appendFileSync(path.join(dir, `${dayKey(at)}.jsonl`), `${JSON.stringify(record)}\n`, {
    mode: PRIVATE_FILE_MODE,
  });
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
