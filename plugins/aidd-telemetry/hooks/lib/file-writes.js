// Which file writes are worth a line, and the path each accepted one appends. A written
// path is recorded, never a derived task_id: that derivation belongs to the reader. The
// task-folder gate below is a volume decision, not a task-identity one.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.js");
const { resolveRunsDir } = require("./repo.js");
const { readCwd, toolFor, TOOLS_BY_HOST } = require("./tools/index.js");
const path = require("node:path");
const { findRunFileByVendorId, appendLine, buildFileWrittenLine, nowIso } = require("./record.js");

// Unanchored pre-filter, tested before any git shellout. A task is a folder of files or a
// single .md file - both shapes exist side by side, so matching only the folder would
// leave real tasks unattachable.
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

// The written-path field differs per tool, and Codex has no path field at all - it is
// inside an apply_patch command string. Each host's own hooks/lib/tools/<host>.js states
// its extractor, or null; gathered here for a caller that wants every host covered rather
// than one at a time (see cli/tests/helpers/telemetry-journal-hook.ts).
const WRITTEN_PATH_EXTRACTOR_BY_HOST = Object.freeze(
  Object.fromEntries(
    Object.entries(TOOLS_BY_HOST)
      .filter(([, tool]) => tool.writtenPath)
      .map(([host, tool]) => [host, tool.writtenPath])
  )
);

const TASKS_DIR = "aidd_docs/tasks";
// A task folder holds documents. A scan that walked node_modules would cost more than the
// git shellout this hook already pays on every event.
//
// Measured 2026-08-22 against a synthetic tree: reaching 2000 entries costs ~13.5ms p95,
// well inside the 200ms p95 the whole turn-end handler already budgets for
// (aidd-telemetry-journal.test.js) while spending ~9ms of it on git shellouts and
// everything else - see measurements.md (aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/)
// for the full numbers, including this repository's own tree, which uses 172 of the 2000.
const MAX_SCAN_ENTRIES = 2000;

/**
 * Every file under the task tree modified since `sinceMs`, repository-relative and
 * "/"-separated. This is what makes a task attributable on a tool that never says what it
 * wrote: a write made through a shell command, an apply_patch, or an editor leaves the
 * same trace on disk as one made through a file tool, and the disk is the one thing every
 * host shares. Scoped to the task tree rather than the repository, so a build touching a
 * thousand files is never walked.
 *
 * `truncated` is true whenever the budget ran out before the tree was fully read - either a
 * directory's own listing was cut short (a wide directory, still processing when the cap
 * hit) or a directory was queued but never opened at all (`pending` non-empty at the end).
 * Checking `pending` alone misses the first case: a listing cut off mid-read can still
 * leave `pending` empty, and reading that as "nothing left" is exactly the silent
 * truncation this exists to catch. `scanned` is exactly how many entries were looked at,
 * never one more: the entry that would have crossed the cap is left unopened rather than
 * counted and dropped.
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

// Guards ordered cheapest-first: the tool-name whitelist and the unanchored path regex
// both run with zero git shellouts. This fires on every tool call, so a tool that wrote
// nothing must be rejected before anything is spawned or walked.
function handleFileWritten(payload, host, sessionId) {
  const stated = statedRawPath(payload, host);
  if (!stated) return;

  const target = resolveRunsDir(payload.cwd);
  if (!target) return;

  const relativePath = taskFolderRelativePath(target.repoRoot, realPathOf(stated));
  if (!relativePath) return;

  // The session id arrives already read behind the host's own declaration (journal.js), the
  // same one the session_start line was named with. Reading payload.session_id here instead
  // would be one host's spelling promoted to a rule - and on Codex it is the spelling that
  // names the parent of a resumed session, so the lookup would find another session's file.
  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (filePath) appendFileWritten(filePath, relativePath, "tool-stated");
}

/**
 * Everything in the task tree that changed during this turn, whoever wrote it.
 *
 * At turn end, not at every tool call. A turn ends once per prompt while tools fire dozens
 * of times, so this costs one walk per turn rather than one per call - and it catches a
 * write made through a shell command, an apply_patch, or anything else no payload names,
 * which is what makes a task attributable on a host that never says what it wrote.
 *
 * The moment recorded is the end of the turn rather than the write itself. That is honest:
 * nothing here observed *when* the file changed, only that it had, and a task is derived
 * from the path rather than from the moment.
 */
function handleTaskFilesObserved(payload, host, sessionId) {
  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;

  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (!filePath) return;

  // The run file's own mtime is the moment this session last wrote a line, so anything in
  // the task tree newer than it changed since. No state to keep, and appending moves the
  // mark forward on its own.
  const since = lastWriteMs(filePath);
  const { found, truncated, scanned } = taskFilesModifiedSince(target.repoRoot, since);
  const alreadyStated = new Set();
  for (const observed of found) {
    if (alreadyStated.has(observed)) continue;
    alreadyStated.add(observed);
    appendFileWritten(filePath, observed, "observed");
  }
  // Silent truncation would read as complete coverage - the one failure mode this layer
  // exists to remove. A reader of the run file must be able to tell "nothing else changed"
  // from "the walk gave up before it could tell."
  if (truncated) {
    appendLine(filePath, buildScanTruncatedLine({ at: nowIso(), cap: MAX_SCAN_ENTRIES, scanned }));
  }
}

function appendFileWritten(filePath, relativePath, source) {
  appendLine(filePath, buildFileWrittenLine({ at: nowIso(), path: relativePath, source }));
}

// Not a record.js builder: record.js owns session_start/turn_end/file_written/step_start
// alone, and readJournalFile there already ignores any type it does not name, so this new
// one is inert to every existing reader rather than breaking one.
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

// git resolves symlinks in --show-toplevel; the tool's file_path may not have (macOS's
// /tmp -> /private/tmp). Falls back to the raw path so a file deleted between write and
// hook does not silently drop a real observation.
function realPathOf(rawPath) {
  try {
    return fs.realpathSync(rawPath);
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
