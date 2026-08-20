// Which file writes are worth a line, and the path each accepted one appends. A written
// path is recorded, never a derived task_id: that derivation belongs to the reader. The
// task-folder gate below is a volume decision, not a task-identity one.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.js");
const { resolveRunsDir } = require("./repo.js");
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

const WRITTEN_PATH_EXTRACTOR_BY_HOST = Object.freeze({
  "claude-code": extractWrittenPathClaudeCode,
});

// Guards ordered cheapest-first: the tool-name whitelist and the unanchored path regex
// both run with zero git shellouts.
function handleFileWritten(payload, host) {
  const extractWrittenPath = WRITTEN_PATH_EXTRACTOR_BY_HOST[host];
  if (!extractWrittenPath) return;

  const rawPath = extractWrittenPath(payload);
  if (!looksLikeTaskPath(rawPath)) return;

  const target = resolveRunsDir(payload.cwd);
  if (!target) return;
  const { repoRoot, dir } = target;

  // git resolves symlinks in --show-toplevel; the tool's file_path may not have (macOS's
  // /tmp -> /private/tmp). Falls back to the raw path so a file deleted between write and
  // hook does not silently drop a real observation.
  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync(rawPath);
  } catch {
    resolvedPath = rawPath;
  }

  const relativePath = taskFolderRelativePath(repoRoot, resolvedPath);
  if (!relativePath) return;

  const filePath = findRunFileByVendorId(dir, payload.session_id);
  if (!filePath) return;

  appendLine(filePath, buildFileWrittenLine({ at: nowIso(), path: relativePath }));
}

module.exports = {
  looksLikeTaskPath,
  taskFolderRelativePath,
  WRITTEN_PATH_EXTRACTOR_BY_HOST,
  handleFileWritten,
};
