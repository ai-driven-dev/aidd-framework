// When a skill's work finished, told rather than inferred - the one thing about a step that
// no host emits. Measured: the `tool_result` for a `Skill` call comes back about a tenth of a
// second after the call, which is the dispatch and not the completion, so `PostToolUse` never
// sees an end. `step-starts.cjs` says the same in its own header. The only party that knows
// the work is over is the skill, and the only channel it has is a tool call it makes.
//
// Read out of the call's own free-form arguments, exactly as `task-declared.cjs` reads a task
// path, and for the same reason: it asks nothing of the host, so every host that forwards
// tool arguments is covered rather than one. The hook stays the writer - a script a skill
// invoked directly would carry no payload, therefore no session id and no cwd, and could not
// find the run file to append to.

const fs = require("node:fs");

const { normalizeSeparators, stringsWithin } = require("./host.cjs");
const { resolveRunsDir } = require("./repo.cjs");
const { readCwd } = require("./tools/index.cjs");
const { findRunFileByVendorId, appendLine, buildStepEndLine, nowIso } = require("./record.cjs");

// The marker, then the skill it closes. Naming the skill is not decoration: closing "whatever
// step is open" closes the wrong one the moment a skill invokes another.
//
// The name must begin with a letter, which is what refuses a path fragment - `../../etc/passwd`
// offers `.` at the first position and matches nothing. `[\w.-]` after that covers every skill
// name this repository ships (`artifact-design`) and the plugin-qualified form
// (`aidd-dev:01-plan`), and nothing else: no slash, no space, no shell metacharacter, so a
// later reader never has to defend against one.
const STEP_END_PATTERN = /aidd:step-end[ \t]+([A-Za-z][\w.-]*(?::[\w.-]+)?)/u;

// A tool call that merely *mentions* the marker - reading this file, grepping for it - closes
// a step it never ran. The same false positive `task-declared.cjs` accepts for a task path
// mentioned in passing, and bounded the same way: a step end can only ever close an interval
// its own session already opened for that exact skill, so a mention in another session, or of
// a skill that never started, writes a line the reader ignores.
function firstStepEndIn(value) {
  for (const candidate of stringsWithin(value)) {
    const match = STEP_END_PATTERN.exec(normalizeSeparators(candidate));
    if (match) return match[1];
  }
  return null;
}

// tool_input is every declared host's own shape for a tool call's arguments; only Copilot's
// canonical builder spells them toolArgs, as a JSON string - which a plain string scan reads
// exactly as well as a parsed object would, so it is read the same way rather than parsed
// first. Identical to `declaredTaskPath`'s own two-field read, deliberately.
function declaredStepEnd(payload) {
  return firstStepEndIn(payload.tool_input) ?? firstStepEndIn(payload.toolArgs);
}

// The same watermark `task-declared.cjs` protects, for the same reason: file-writes.cjs reads
// the run file's own mtime as "the moment this session last wrote a line" to know what changed
// since, and an end landing between a shell write and the turn end that observes it would push
// that mark past the write, silently dropping it. Restoring the mtime leaves the line itself
// the only trace on disk.
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
