// When a skill's work finished, told rather than inferred: no host emits it. A `Skill` call's
// `tool_result` comes back a tenth of a second later, which is the dispatch and not the
// completion, so the only party that knows the work is over is the skill itself.
//
// Read out of the call's own free-form arguments, which asks nothing of the host, so every
// host forwarding tool arguments is covered. The hook stays the writer: a script a skill
// invoked directly would carry no session id and no cwd, and could find no run file.

const fs = require("node:fs");

const { normalizeSeparators, stringsWithin } = require("./host.cjs");
const { resolveRunsDir } = require("./repo.cjs");
const { readCwd } = require("./tools/index.cjs");
const { findRunFileByVendorId, appendLine, buildStepEndLine, nowIso } = require("./record.cjs");

// The marker, then the skill it closes: closing "whatever step is open" closes the wrong one
// the moment a skill invokes another. The name must begin with a letter, which refuses a path
// fragment, and the rest admits no slash, space or shell metacharacter, so a later reader
// never has to defend against one.
const STEP_END_PATTERN = /aidd:step-end[ \t]+([A-Za-z][\w.-]*(?::[\w.-]+)?)/u;

// A call merely *mentioning* the marker closes a step it never ran - the same false positive
// `task-declared.cjs` accepts, bounded the same way: an end can only close an interval its own
// session opened for that exact skill, so any other mention writes a line the reader ignores.
function firstStepEndIn(value) {
  for (const candidate of stringsWithin(value)) {
    const match = STEP_END_PATTERN.exec(normalizeSeparators(candidate));
    if (match) return match[1];
  }
  return null;
}

// tool_input is every declared host's shape for a call's arguments; only Copilot's canonical
// builder spells them toolArgs, as a JSON string a plain scan reads just as well.
function declaredStepEnd(payload) {
  return firstStepEndIn(payload.tool_input) ?? firstStepEndIn(payload.toolArgs);
}

// The watermark `task-declared.cjs` protects, for the same reason: file-writes.cjs reads the
// run file's mtime as "the moment this session last wrote a line", and an end landing between
// a shell write and the turn end that observes it would push that mark past the write.
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
    // A run file that vanished between the append and this restore costs the watermark, not
    // the line - the same tolerance every other write in this directory takes.
  }
}

function handleStepEnd(payload, host, sessionId) {
  const skill = declaredStepEnd(payload);
  if (!skill) return;

  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;

  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (!filePath) return;

  const before = mtimeOf(filePath);
  appendLine(filePath, buildStepEndLine({ at: nowIso(), skill }));
  if (before) restoreMtime(filePath, before);
}

module.exports = {
  STEP_END_PATTERN,
  declaredStepEnd,
  handleStepEnd,
};
