// Which file writes are worth a line, and the path each accepted one appends. A written
// path is recorded, never a derived task_id: that derivation belongs to the reader. The
// task-folder gate below is a volume decision, not a task-identity one.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.js");
const { readCwd, resolveRunsDir } = require("./repo.js");
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
// inside an apply_patch command string. Hence a per-host extractor.

const CLAUDE_CODE_WRITE_TOOL_PATH_FIELDS = Object.freeze({
  Write: "file_path",
  Edit: "file_path",
  NotebookEdit: "notebook_path",
});

function extractWrittenPathClaudeCode(payload) {
  const field = CLAUDE_CODE_WRITE_TOOL_PATH_FIELDS[payload.tool_name];
  if (!field) return null;
  const value = payload.tool_input && payload.tool_input[field];
  return typeof value === "string" && value ? value : null;
}

// Claude Code alone, and that is a coverage fact rather than an oversight: Copilot and
// Cursor were never captured handing a path to a hook, and Codex writes through an
// apply_patch command string. A host with no entry here is not blind to tasks - the
// observed pass below covers it - but a stated path is exact where an observed one is
// inferred, so it is preferred wherever it exists.
const WRITTEN_PATH_EXTRACTOR_BY_HOST = Object.freeze({
  "claude-code": extractWrittenPathClaudeCode,
});

const TASKS_DIR = "aidd_docs/tasks";
// A task folder holds documents. A scan that walked node_modules would cost more than the
// git shellout this hook already pays on every event.
const MAX_SCAN_ENTRIES = 2000;

// Every file under the task tree modified since `sinceMs`, repository-relative and
// "/"-separated. This is what makes a task attributable on a tool that never says what it
// wrote: a write made through a shell command, an apply_patch, or an editor leaves the
// same trace on disk as one made through a file tool, and the disk is the one thing every
// host shares. Scoped to the task tree rather than the repository, so a build touching a
// thousand files is never walked.
function taskFilesModifiedSince(repoRoot, sinceMs) {
  const root = path.join(repoRoot, ...TASKS_DIR.split("/"));
  const found = [];
  const pending = [root];
  let seen = 0;
  while (pending.length > 0 && seen < MAX_SCAN_ENTRIES) {
    const dir = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++seen >= MAX_SCAN_ENTRIES) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
      } else if (entry.isFile() && modifiedSince(full, sinceMs)) {
        found.push(normalizeSeparators(path.relative(repoRoot, full)));
      }
    }
  }
  return found;
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
  const alreadyStated = new Set();
  for (const observed of taskFilesModifiedSince(target.repoRoot, since)) {
    if (alreadyStated.has(observed)) continue;
    alreadyStated.add(observed);
    appendFileWritten(filePath, observed, "observed");
  }
}

function appendFileWritten(filePath, relativePath, source) {
  appendLine(filePath, buildFileWrittenLine({ at: nowIso(), path: relativePath, source }));
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
  const extractWrittenPath = WRITTEN_PATH_EXTRACTOR_BY_HOST[host];
  if (!extractWrittenPath) return null;
  const rawPath = extractWrittenPath(payload);
  return looksLikeTaskPath(rawPath) ? rawPath : null;
}

module.exports = {
  looksLikeTaskPath,
  taskFolderRelativePath,
  taskFilesModifiedSince,
  WRITTEN_PATH_EXTRACTOR_BY_HOST,
  handleFileWritten,
  handleTaskFilesObserved,
};
