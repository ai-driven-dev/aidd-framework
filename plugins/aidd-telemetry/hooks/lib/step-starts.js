// Which tool calls open a step, and the name each one carries. Only the start is
// recorded: no tool measured so far exposes when a skill's work finishes, so the interval
// is the reader's derivation from the lines that follow.

const { normalizeSeparators } = require("./host.js");
const { readCwd, resolveRunsDir } = require("./repo.js");
const { findRunFileByVendorId, appendLine, buildStepStartLine, nowIso } = require("./record.js");

// Anchored on a `skills/` segment, so an ordinary file named SKILL.md opens nothing. The
// tail accepts end-of-string or a quote/space, because on Codex the path sits inside a
// shell command line rather than alone in a field.
const SKILL_FILE_PATTERN = /(?:^|\/)skills\/([^/]+)\/SKILL\.md(?:["'\s]|$)/u;

// Copilot delivers its tool arguments as a JSON string; Claude Code delivers an object.
function parseToolArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// The argument family: the host names the skill outright, in a field of the tool call.
function skillNameFromArgument({ toolField, toolName, argumentsField, nameField }) {
  return (payload) => {
    if (payload[toolField] !== toolName) return null;
    const args = parseToolArguments(payload[argumentsField]);
    const name = args && args[nameField];
    return typeof name === "string" && name ? name : null;
  };
}

function* stringsWithin(value) {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) yield* stringsWithin(nested);
}

// The path family: the host names no skill, and the only evidence is that it read a
// SKILL.md. Every string in the tool's arguments is scanned rather than one named field,
// because Cursor puts the path in `file_path` while Codex buries it in a shell command -
// and because Codex's hook calls that tool `Bash` while its own transcripts call it
// `exec_command`, so keying on a tool name would have matched nothing, silently.
function skillNameFromSkillFileRead(payload) {
  for (const value of stringsWithin(payload.tool_input)) {
    const match = SKILL_FILE_PATTERN.exec(normalizeSeparators(value));
    if (match) return match[1];
  }
  return null;
}

// One entry per host, holding both per-host facts: how the skill name is found, and which
// field carries the turn identifier a reader joins the step to. Exactly one family runs
// per host - an argument-family payload can also carry a SKILL.md path in some other
// field, and running both would yield two candidates for one call.
const STEP_START_BY_HOST = Object.freeze({
  "claude-code": {
    skillName: skillNameFromArgument({
      toolField: "tool_name",
      toolName: "Skill",
      argumentsField: "tool_input",
      nameField: "skill",
    }),
    turnIdField: "prompt_id",
  },
  copilot: {
    skillName: skillNameFromArgument({
      toolField: "toolName",
      toolName: "skill",
      argumentsField: "toolArgs",
      nameField: "skill",
    }),
    // Copilot carries a turn identifier on its session events, never on a hook payload.
    turnIdField: null,
  },
  codex: { skillName: skillNameFromSkillFileRead, turnIdField: "turn_id" },
  cursor: { skillName: skillNameFromSkillFileRead, turnIdField: "generation_id" },
});

// Its own guard chain, deliberately not `handleFileWritten`'s: that one returns early
// unless the path looks like a task folder, and a skill call has no task path.
function handleStepStart(payload, host, sessionId) {
  const declaration = STEP_START_BY_HOST[host];
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
  skillNameFromSkillFileRead,
  handleStepStart,
};
