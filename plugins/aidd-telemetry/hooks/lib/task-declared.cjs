// Which ticket a session is on, told rather than inferred. Inferring it from a written path
// works only where the host hands one over in readable form; a declaration asks nothing of the
// host, since any call whose arguments name a file under a task folder is evidence the flow is
// on that task, and naming the file is what calling the tool already requires.

const fs = require("node:fs");

const { normalizeSeparators, stringsWithin } = require("./host.cjs");
const { resolveRunsDir } = require("./repo.cjs");
const { readCwd, toolFor } = require("./tools/index.cjs");
const { findRunFileByVendorId, appendLine, buildTaskDeclaredLine, nowIso } = require("./record.cjs");

// Unanchored and tolerant of sitting inside a larger string, closed by a quote or whitespace.
// Two shapes, matching file-writes.cjs's own TASK_SEGMENT_PATTERN exactly: a folder task
// continues past a "/" into its file, a single-file task ends the segment in ".md", and a bare
// segment with neither is not a task path in either place.
const TASK_PATH_PATTERN =
  /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\/[^"'\s]*|aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\.md/u;

function firstTaskPathIn(value) {
  for (const candidate of stringsWithin(value)) {
    const match = TASK_PATH_PATTERN.exec(normalizeSeparators(candidate));
    if (match) return match[0];
  }
  return null;
}

// tool_input is every declared host's shape for a call's arguments; only Copilot's canonical
// builder spells them toolArgs, as a JSON string a plain scan reads just as well.
function declaredTaskPath(payload) {
  return firstTaskPathIn(payload.tool_input) ?? firstTaskPathIn(payload.toolArgs);
}

// A write this host's own extractor can name is handleFileWritten's claim: that reading is
// exact, where a declaration is an inference from arguments text, and both firing on one event
// would be two claims about one write. A Bash write, which no extractor reads on any host, is
// not excluded and reaches the declaration below on its arguments text.
function statedAsWrittenAlready(payload, host) {
  const tool = toolFor(host);
  const extractWrittenPath = tool && tool.writtenPath;
  return typeof extractWrittenPath === "function" && typeof extractWrittenPath(payload) === "string";
}

// A declaration must never move the run file's mtime forward: the observed pass reads it as
// "the moment this session last wrote a line", and a mention landing between a shell write and
// the turn end that observes it would push the watermark past that write.
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

// Its own guard chain, not handleFileWritten's: this fires for any call on any host, because
// the evidence it reads is the arguments themselves rather than a named field.
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
