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
  const journal = { session: null, boundaries: [], filesWritten: [], taskDeclarations: [] };
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
    } else if (line.type === "task_declared" && typeof line.path === "string") {
      // Its own array, never boundaries: buildStepIntervals pairs every boundary against
      // whichever timed one comes next, of any type, so a task line mixed in there would
      // close a running step early. buildTaskIntervals (report.js) reads this array plus
      // boundaries' own turn_end lines instead.
      journal.taskDeclarations.push(line);
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

/**
 * The project a journalled session ran in, one hop past `session_start` - which already
 * resolved both `project_id` and `project_remote` and stops there. `project_remote` wins
 * when it exists: it is a git remote, the same for every checkout of one repository,
 * where `project_id` alone falls back to a directory name that collides across machines.
 * `project_field` names which of the two the value came from, the same reason
 * `vendor_field` exists on the identifier - so a consumer never has to guess.
 *
 * A journal with no session, or a session naming neither field, answers `{}`: no project
 * is the honest reading, never a guess at the reader's own repository.
 */
function projectOf(journal) {
  const session = journal && journal.session;
  if (!session) return {};
  if (typeof session.project_remote === "string" && session.project_remote !== "") {
    return { project_id: session.project_remote, project_field: "project_remote" };
  }
  if (typeof session.project_id === "string" && session.project_id !== "") {
    return { project_id: session.project_id, project_field: "project_id" };
  }
  return {};
}

module.exports = { listJournals, readJournal, projectOf };
