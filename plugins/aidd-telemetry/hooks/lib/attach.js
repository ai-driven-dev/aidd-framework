// attach.js - task attachment from path evidence, not a declaration: when a
// session's own file-written payload names a path inside
// <repoRoot>/aidd_docs/tasks/<yyyy_mm>/<task_id>/, that session is working on
// <task_id>. Evidence can only add an attachment, never retract one.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.js");
const { resolveRunsDir } = require("./repo.js");
const { findRunFileByVendorId, readRecord, writeRecord, nowIso } = require("./record.js");

// Unanchored pre-filter, tested before any git shellout; taskIdFromPath below
// anchors against the real repo root.
//
// A task is a folder of files, or a single .md file - this repository's own
// aidd_docs/tasks/2026_06/ carries both shapes side by side, so matching only
// the folder would leave real tasks unattachable.
const TASK_SEGMENT_PATTERN = /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/]+(\/|\.md$)/u;

function looksLikeTaskPath(rawPath) {
  return typeof rawPath === "string" && TASK_SEGMENT_PATTERN.test(normalizeSeparators(rawPath));
}

const TASK_ID_PATTERN = /^aidd_docs\/tasks\/\d{4}_\d{2}\/([^/]+?)(?:\/|\.md$)/u;

// Anchored at repoRoot with a "/" boundary, not a bare string prefix (which
// would let repoRoot "/foo/bar" match a sibling "/foo/barbaz/...").
function taskIdFromPath(repoRoot, rawPath) {
  if (typeof repoRoot !== "string" || !repoRoot || typeof rawPath !== "string" || !rawPath) return null;
  const normalizedPath = normalizeSeparators(rawPath);
  let root = normalizeSeparators(repoRoot);
  if (!root.endsWith("/")) root += "/";
  if (!normalizedPath.startsWith(root)) return null;
  const match = TASK_ID_PATTERN.exec(normalizedPath.slice(root.length));
  return match ? match[1] : null;
}

// The written-path field differs per tool (tool_input.file_path, or
// notebook_path for NotebookEdit), and Codex has no path field at all - it is
// inside an apply_patch command string. This is why the extractor is
// per-host.

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

const WRITTEN_PATH_EXTRACTOR_BY_HOST = Object.freeze({
  "claude-code": extractWrittenPathClaudeCode,
});

// `to: null` means attached until the session ends, so a reader substitutes
// ended_at. Only moving to a different task closes an interval; writing to the
// same task again must not, or the attachment would stop at the last write
// while the session carried on working on it.
function advanceTasks(tasks, taskId, now, fallbackFrom) {
  const list = Array.isArray(tasks) ? tasks.slice() : [];
  const open = list[list.length - 1];

  if (!open) {
    list.push({ task_id: taskId, from: fallbackFrom, to: null });
    return list;
  }

  // The session-start placeholder is never a real interval, so the first
  // evidence replaces it outright rather than closing an empty one and
  // appending a second - that is what keeps "task A then task B" two
  // intervals, not three.
  if (open.task_id === null && open.to === null) {
    list[list.length - 1] = { task_id: taskId, from: open.from, to: null };
    return list;
  }

  if (open.to === null) {
    if (open.task_id === taskId) return list;
    list[list.length - 1] = { task_id: open.task_id, from: open.from, to: now };
  }

  list.push({ task_id: taskId, from: now, to: null });
  return list;
}

// Guards ordered cheapest-first: the tool-name whitelist and the unanchored
// path regex both run with zero git shellouts, so a Bash/Read/Grep call (or
// a Write outside any task folder) never reaches resolveRunsDir at all.
function handleFileWritten(payload, host) {
  const extractWrittenPath = WRITTEN_PATH_EXTRACTOR_BY_HOST[host];
  if (!extractWrittenPath) return;

  const rawPath = extractWrittenPath(payload);
  if (!looksLikeTaskPath(rawPath)) return;

  const target = resolveRunsDir(payload.cwd);
  if (!target) return;
  const { repoRoot, dir } = target;

  // git resolves symlinks in --show-toplevel; the tool's own file_path may
  // not have (macOS's /tmp -> /private/tmp is the common case). Falls back to
  // the raw path rather than bailing, since a deleted-between-write-and-hook
  // file must not silently drop a real attachment.
  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync(rawPath);
  } catch {
    resolvedPath = rawPath;
  }

  const taskId = taskIdFromPath(repoRoot, resolvedPath);
  if (!taskId) return;

  const filePath = findRunFileByVendorId(dir, payload.session_id);
  if (!filePath) return;

  const record = readRecord(filePath);
  const now = nowIso();
  // Copilot has no turn-end event, so this is what keeps ended_at live for it.
  record.ended_at = now;
  record.tasks = advanceTasks(record.tasks, taskId, now, record.started_at);
  writeRecord(filePath, record);
}

module.exports = {
  looksLikeTaskPath,
  taskIdFromPath,
  WRITTEN_PATH_EXTRACTOR_BY_HOST,
  advanceTasks,
  handleFileWritten,
};
