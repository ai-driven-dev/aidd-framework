const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectBacklog } = require("../check-backlog.js");

const ROOT = path.join(os.tmpdir(), "aidd-pm-backlog");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WAIT = new Int32Array(new SharedArrayBuffer(4));

function fingerprints(cwd, snapshot = inspectBacklog(cwd)) {
  // Files are named from the project the backlog belongs to, which is not always where a tool runs.
  const root = snapshot.project ?? cwd;
  return Object.fromEntries(snapshot.files.map((relative) => {
    const content = fs.readFileSync(path.resolve(root, relative));
    return [relative, crypto.createHash("sha256").update(content).digest("hex")];
  }));
}

function keyFor(event) {
  const identity = `${event.cwd}\0${event.sessionId || "session"}`;
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

function fileFor(event) {
  return path.join(ROOT, `${keyFor(event)}.json`);
}

function readJournal(event) {
  try {
    const journal = JSON.parse(fs.readFileSync(fileFor(event), "utf8"));
    if (journal?.version !== 1 || !Array.isArray(journal?.before?.artifacts) ||
      !journal.fingerprints || !Number.isFinite(journal.startedAt)) {
      return { corrupt: true };
    }
    if (Date.now() - journal.startedAt > MAX_AGE_MS) {
      fs.unlinkSync(fileFor(event));
      return null;
    }
    return journal;
  } catch (error) {
    return error?.code === "ENOENT" ? null : { corrupt: true };
  }
}

function writeJournal(event, journal) {
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const target = fileFor(event);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(journal)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function withLock(event, operation) {
  const lock = `${fileFor(event)}.lock`;
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 1000;
  while (true) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 5000) fs.rmSync(lock, { recursive: true });
      } catch (statError) {
        if (statError?.code !== "ENOENT") throw statError;
      }
      if (Date.now() >= deadline) throw new Error("backlog transaction lock timed out");
      Atomics.wait(WAIT, 0, 0, 10);
    }
  }
  try {
    return operation();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/** The statuses each artifact held when a write was about to happen: the turn's real path. */
function noteWaypoints(journal, statuses) {
  journal.waypoints = journal.waypoints || {};
  for (const [file, status] of Object.entries(statuses)) {
    const walked = journal.waypoints[file] || [];
    if (walked[walked.length - 1] !== status) walked.push(status);
    journal.waypoints[file] = walked;
  }
}

function beginJournal(event, contractPaths = [], statuses = null) {
  return withLock(event, () => {
    const existing = readJournal(event);
    let journal = existing && !existing.corrupt ? existing : null;
    if (!journal) {
      const before = inspectBacklog(event.cwd);
      journal = {
        version: 1,
        cwd: event.cwd,
        sessionId: event.sessionId,
        startedAt: Date.now(),
        before,
        fingerprints: fingerprints(event.cwd, before),
      };
    }
    if (statuses) noteWaypoints(journal, statuses);
    // Kept in the order they were staged: the turn's story about one artifact reads first to last.
    journal.contractPaths = [...new Set([...(journal.contractPaths || []), ...contractPaths])];
    writeJournal(event, journal);
    return journal;
  });
}

/** A record only becomes immutable once it was accepted; a rejected one may be staged again. */
function markRejected(event, contractPaths) {
  return withLock(event, () => {
    const journal = readJournal(event);
    if (!journal || journal.corrupt) return journal;
    journal.rejected = [...new Set([...(journal.rejected || []), ...contractPaths])].sort();
    writeJournal(event, journal);
    return journal;
  });
}

function clearJournal(event) {
  try {
    fs.unlinkSync(fileFor(event));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

module.exports = { beginJournal, clearJournal, fileFor, fingerprints, markRejected, readJournal, withLock };
