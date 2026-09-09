// Which file writes are worth a line, and the path each accepted one appends. A written
// path is recorded, never a derived task_id: that derivation belongs to the reader. The
// task-folder gate below is a volume decision, not a task-identity one.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.cjs");
const { resolveRunsDir } = require("./repo.cjs");
const { readCwd, toolFor, TOOLS_BY_HOST } = require("./tools/index.cjs");
const path = require("node:path");
const { findRunFileByVendorId, appendLine, buildFileWrittenLine, nowIso } = require("./record.cjs");

// Unanchored pre-filter, tested before any git shellout. A task is a folder of files or a
// single .md file, and both shapes exist side by side.
const TASK_SEGMENT_PATTERN = /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/]+(\/|\.md$)/u;

function looksLikeTaskPath(rawPath) {
  return typeof rawPath === "string" && TASK_SEGMENT_PATTERN.test(normalizeSeparators(rawPath));
}

const TASK_PATH_ANCHOR_PATTERN = /^aidd_docs\/tasks\/\d{4}_\d{2}\/[^/]+(?:\/|\.md$)/u;

// Anchored at repoRoot with a "/" boundary, not a bare string prefix, which would let
// repoRoot "/foo/bar" match a sibling "/foo/barbaz/...".
function taskFolderRelativePath(repoRoot, rawPath) {
  if (typeof repoRoot !== "string" || !repoRoot || typeof rawPath !== "string" || !rawPath) return null;
  const normalizedPath = normalizeSeparators(rawPath);
  let root = normalizeSeparators(repoRoot);
  if (!root.endsWith("/")) root += "/";
  if (!normalizedPath.startsWith(root)) return null;
  const relative = normalizedPath.slice(root.length);
  return TASK_PATH_ANCHOR_PATTERN.test(relative) ? relative : null;
}

// The written-path field differs per tool, and Codex has no path field at all - it is inside
// an apply_patch command string. Each host's own tools file states its extractor, or null;
// gathered here for a caller that wants every host at once.
const WRITTEN_PATH_EXTRACTOR_BY_HOST = Object.freeze(
  Object.fromEntries(
    Object.entries(TOOLS_BY_HOST)
      .filter(([, tool]) => tool.writtenPath)
      .map(([host, tool]) => [host, tool.writtenPath])
  )
);

const TASKS_DIR = "aidd_docs/tasks";
// A task folder holds documents, and a scan that walked node_modules would cost more than
// the git shellout this hook already pays on every event. Reaching this cap measures ~13.5ms
// p95, well inside the 200ms p95 the turn-end handler is held to.
const MAX_SCAN_ENTRIES = 2000;

/**
 * Every file under the task tree modified since `sinceMs`, repository-relative and
 * "/"-separated. This is what makes a task attributable on a tool that never says what it
 * wrote: the disk is the one thing every host shares. Scoped to the task tree, so a build
 * touching a thousand files is never walked.
 *
 * `truncated` covers both ways the budget can run out - a listing cut short mid-read, or a
 * directory queued and never opened. Checking `pending` alone misses the first, which is
 * exactly the silent truncation this exists to catch.
 */
function taskFilesModifiedSince(repoRoot, sinceMs) {
  const root = path.join(repoRoot, ...TASKS_DIR.split("/"));
  const found = [];
  const pending = [root];
  let seen = 0;
  let cutShort = false;
  while (pending.length > 0 && seen < MAX_SCAN_ENTRIES) {
    const dir = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (seen >= MAX_SCAN_ENTRIES) {
        cutShort = true;
        break;
      }
      seen++;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
      } else if (entry.isFile() && modifiedSince(full, sinceMs)) {
        found.push(normalizeSeparators(path.relative(repoRoot, full)));
      }
    }
  }
  return { found, truncated: cutShort || pending.length > 0, scanned: seen };
}

function modifiedSince(filePath, sinceMs) {
  try {
    return fs.statSync(filePath).mtimeMs > sinceMs;
  } catch {
    return false;
  }
}

// Cheapest-first: this fires on every tool call, so a tool that wrote nothing must be
// rejected before anything is spawned or walked.
function handleFileWritten(payload, host, sessionId) {
  const stated = statedRawPath(payload, host);
  if (!stated) return;

  const target = resolveRunsDir(payload.cwd);
  if (!target) return;

  const relativePath = taskFolderRelativePath(target.repoRoot, realPathOf(stated));
  if (!relativePath) return;

  // The session id arrives already read behind the host's own declaration. Reading
  // payload.session_id here would be one host's spelling promoted to a rule, and on Codex it
  // names the parent of a resumed session, so the lookup would find another session's file.
  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (filePath) appendFileWritten(filePath, relativePath, "tool-stated");
}

/**
 * Everything in the task tree that changed during this turn, whoever wrote it. At turn end,
 * not at every tool call: a turn ends once per prompt while tools fire dozens of times, and
 * this is what catches a write no payload names.
 *
 * The moment recorded is the end of the turn rather than the write itself, because nothing
 * here observed when the file changed, only that it had.
 */
function handleTaskFilesObserved(payload, host, sessionId) {
  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;

  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (!filePath) return;

  // The run file's own mtime is the moment this session last wrote a line, so no state has
  // to be kept: appending moves the mark forward on its own.
  const since = lastWriteMs(filePath);
  const { found, truncated, scanned } = taskFilesModifiedSince(target.repoRoot, since);
  const alreadyStated = new Set();
  for (const observed of found) {
    if (alreadyStated.has(observed)) continue;
    alreadyStated.add(observed);
    appendFileWritten(filePath, observed, "observed");
  }
  // Silent truncation would read as complete coverage: a reader must be able to tell
  // "nothing else changed" from "the walk gave up before it could tell".
  if (truncated) {
    appendLine(filePath, buildScanTruncatedLine({ at: nowIso(), cap: MAX_SCAN_ENTRIES, scanned }));
  }
}

function appendFileWritten(filePath, relativePath, source) {
  appendLine(filePath, buildFileWrittenLine({ at: nowIso(), path: relativePath, source }));
}

// Not a record.cjs builder: a reader ignores any type it does not name, so this one is inert
// to every existing reader rather than breaking one.
function buildScanTruncatedLine({ at, cap, scanned }) {
  return { type: "scan_truncated", at, cap, scanned };
}

function lastWriteMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return Date.now();
  }
}

// git resolves symlinks in --show-toplevel and the tool's own path may not have. `.native`
// rather than the plain JS realpath: on Windows the JS one leaves an 8.3 short-name alias
// untouched, so it never matches git's already-canonical answer. Falls back to the raw path,
// so a file deleted between write and hook does not silently drop a real observation.
function realPathOf(rawPath) {
  try {
    return fs.realpathSync.native(rawPath);
  } catch {
    return rawPath;
  }
}

// The path the host handed us, when it hands one and it looks like a task path at all.
function statedRawPath(payload, host) {
  const tool = toolFor(host);
  const extractWrittenPath = tool && tool.writtenPath;
  if (!extractWrittenPath) return null;
  const rawPath = extractWrittenPath(payload);
  return looksLikeTaskPath(rawPath) ? rawPath : null;
}

module.exports = {
  looksLikeTaskPath,
  taskFolderRelativePath,
  taskFilesModifiedSince,
  MAX_SCAN_ENTRIES,
  WRITTEN_PATH_EXTRACTOR_BY_HOST,
  handleFileWritten,
  handleTaskFilesObserved,
};
