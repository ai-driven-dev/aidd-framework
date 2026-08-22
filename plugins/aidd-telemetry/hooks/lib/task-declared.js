// Which ticket a session is on, told rather than inferred - the same move step-starts.js
// already made for which skill is running. A task is inferred today from a written path, and
// only Claude Code's payload hands one over in readable form. A declaration asks nothing of
// the host: any tool call whose own arguments name a file under a task folder is evidence the
// flow is on that task, and naming the file you are about to read (or edit, or grep) is what
// calling the tool already requires - Read, Edit, and a Bash command line all carry it.

const fs = require("node:fs");

const { normalizeSeparators } = require("./host.js");
const { readCwd, resolveRunsDir } = require("./repo.js");
const { findRunFileByVendorId, appendLine, buildTaskDeclaredLine, nowIso } = require("./record.js");
const { stringsWithin } = require("./step-starts.js");
const { WRITTEN_PATH_EXTRACTOR_BY_HOST } = require("./file-writes.js");

// Unanchored, and tolerant of sitting inside a larger string - a quote or whitespace closes
// it, the same tolerance SKILL_FILE_PATTERN gives a Codex shell command line. Two shapes,
// matching file-writes.js's own TASK_SEGMENT_PATTERN exactly: a folder task's path continues
// past a "/" into its own file, a single-file task's ends the segment itself in ".md" - a
// bare segment with neither (a task folder mentioned with no file, a random ".txt") is not a
// task path either place.
const TASK_PATH_PATTERN =
  /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\/[^"'\s]*|aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\.md/u;

function firstTaskPathIn(value) {
  for (const candidate of stringsWithin(value)) {
    const match = TASK_PATH_PATTERN.exec(normalizeSeparators(candidate));
    if (match) return match[0];
  }
  return null;
}

// tool_input is every declared host's own shape for a tool call's arguments, Copilot's
// _vsCodeCompat builder included (see step-starts.js). Only Copilot's canonical builder
// carries none, spelling its arguments toolArgs instead - a JSON string, but a plain string
// scan finds a path inside it exactly as well as a parsed object would, so it is read the
// same way rather than parsed first.
function declaredTaskPath(payload) {
  return firstTaskPathIn(payload.tool_input) ?? firstTaskPathIn(payload.toolArgs);
}

// A write into a task folder that this host's own extractor can already name is
// handleFileWritten's claim, not this one's: that reading is exact (a field the host itself
// populated), where a declaration is only ever an inference from arguments text, and the two
// firing on the same event would be two claims about one write. Restricted to hosts and tools
// WRITTEN_PATH_EXTRACTOR_BY_HOST actually names - a Bash write, which no extractor reads on
// any host, is not excluded here and reaches the declaration below on its own arguments text.
function statedAsWrittenAlready(payload, host) {
  const extractWrittenPath = WRITTEN_PATH_EXTRACTOR_BY_HOST[host];
  return typeof extractWrittenPath === "function" && typeof extractWrittenPath(payload) === "string";
}

// A declaration must never move the run file's own mtime forward: file-writes.js's observed
// pass reads that mtime as "the moment this session last wrote a line" to know what changed
// since. A task mention landing between a shell write and the turn end that observes it would
// push the watermark past that write, silently dropping it - so the append below restores the
// mtime it found, leaving the line itself the only trace on disk.
function mtimeOf(filePath) {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

function restoreMtime(filePath, mtime) {
  try {
    fs.utimesSync(filePath, mtime, mtime);
  } catch {
    // Best effort: a failed restore costs the next observed pass a possible false negative
    // for an unrelated write, never the declaration itself, which is already on disk.
  }
}

// Its own guard chain, deliberately not handleFileWritten's: that one only fires for a write
// tool on the one host whose field names are known, while this fires for any tool call on any
// host, because the evidence it reads is the arguments themselves rather than a named field.
function handleTaskDeclared(payload, host, sessionId) {
  if (statedAsWrittenAlready(payload, host)) return;

  const path = declaredTaskPath(payload);
  if (!path) return;

  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;

  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (!filePath) return;

  const before = mtimeOf(filePath);
  appendLine(filePath, buildTaskDeclaredLine({ at: nowIso(), path }));
  if (before) restoreMtime(filePath, before);
}

module.exports = { TASK_PATH_PATTERN, declaredTaskPath, handleTaskDeclared };
