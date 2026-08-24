// Which tool calls open a step. How each host answers that now lives in its own file
// under hooks/lib/tools/ - this only dispatches to it. Only the start is recorded: no tool
// measured so far exposes when a skill's work finishes, so the interval is the reader's
// derivation from the lines that follow.

const { resolveRunsDir } = require("./repo.cjs");
const { readCwd, toolFor, TOOLS_BY_HOST } = require("./tools/index.cjs");
const { findRunFileByVendorId, appendLine, buildStepStartLine, nowIso } = require("./record.cjs");
const { SKILL_FILE_PATTERN } = require("./tools/skill-detection.cjs");

// Gathered from the per-host declarations for a caller that wants every host covered
// rather than one at a time (see cli/tests/helpers/telemetry-journal-hook.ts and
// scripts/__tests__/aidd-telemetry-journal.test.js). A host with no stepStart - OpenCode,
// whose plugin forwards no tool call at all - is simply absent, the same shape a
// hand-maintained table gave before this moved.
const STEP_START_BY_HOST = Object.freeze(
  Object.fromEntries(
    Object.entries(TOOLS_BY_HOST)
      .filter(([, tool]) => tool.stepStart)
      .map(([host, tool]) => [host, tool.stepStart])
  )
);

// Its own guard chain, deliberately not `handleFileWritten`'s: that one returns early
// unless the path looks like a task folder, and a skill call has no task path.
function handleStepStart(payload, host, sessionId) {
  const tool = toolFor(host);
  const declaration = tool && tool.stepStart;
  if (!declaration) return;

  const skill = declaration.skillName(payload);
  if (!skill) return;

  const target = resolveRunsDir(readCwd(host, payload));
  if (!target) return;

  const filePath = findRunFileByVendorId(target.dir, sessionId);
  if (!filePath) return;

  const turnId = declaration.turnIdField ? payload[declaration.turnIdField] : undefined;
  appendLine(filePath, buildStepStartLine({ at: nowIso(), skill, turnId }));
}

module.exports = {
  SKILL_FILE_PATTERN,
  STEP_START_BY_HOST,
  handleStepStart,
};
