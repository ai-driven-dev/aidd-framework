// The run journal: what the hooks recorded about a session.

const fs = require("node:fs");
const path = require("node:path");

const RUN_FILE_EXTENSION = ".jsonl";
const ULID_LENGTH = 26;

function runsDir(projectRoot) {
  return process.env.AIDD_RUNS_DIR || path.join(projectRoot, "aidd_docs", "runs");
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readJournalFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const journal = { session: null, boundaries: [], filesWritten: [] };
  for (const raw of content.split("\n")) {
    const line = raw.trim() === "" ? null : parseLine(raw);
    if (!line || typeof line.at !== "string") continue;
    if (line.type === "session_start") {
      if (!journal.session && line.run_id && line.tool && line.vendor_id) journal.session = line;
    } else if (line.type === "turn_end") {
      journal.boundaries.push(line);
    } else if (line.type === "step_start" && typeof line.skill === "string") {
      journal.boundaries.push(line);
    } else if (line.type === "file_written" && typeof line.path === "string") {
      journal.filesWritten.push(line);
    }
  }
  return journal;
}

function listRunFiles(projectRoot) {
  const dir = runsDir(projectRoot);
  let entries;
  try {
    entries = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith(RUN_FILE_EXTENSION))
    .map((entry) => path.join(dir, entry));
}

// Split on the fixed ULID length, never on "__": a sanitised vendor id can contain it.
function vendorIdOf(fileName) {
  const stem = fileName.slice(0, -RUN_FILE_EXTENSION.length);
  return stem.slice(ULID_LENGTH, ULID_LENGTH + 2) === "__" ? stem.slice(ULID_LENGTH + 2) : null;
}

function sanitizeSegment(segment) {
  const cleaned = String(segment).replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

/** Every session the journal knows, oldest file first. */
function listJournals(projectRoot) {
  const journals = [];
  for (const filePath of listRunFiles(projectRoot)) {
    const journal = readJournalFile(filePath);
    if (journal) journals.push(journal);
  }
  return journals;
}

function readJournal(projectRoot, sessionId) {
  const wanted = sanitizeSegment(sessionId);
  for (const filePath of listRunFiles(projectRoot)) {
    if (vendorIdOf(path.basename(filePath)) === wanted) return readJournalFile(filePath);
  }
  return null;
}

module.exports = { listJournals, readJournal };
