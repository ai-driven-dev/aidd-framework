// Everything the journal knows about Claude Code: session_id and cwd straight off its own
// payload, tool_input.file_path/notebook_path naming a write, tool_name "Skill" naming its
// own step with prompt_id as the turn it belongs to.

const { skillNameFromArgument } = require("./skill-detection.cjs");

const WRITE_TOOL_PATH_FIELDS = Object.freeze({
  Write: "file_path",
  Edit: "file_path",
  NotebookEdit: "notebook_path",
});

function writtenPath(payload) {
  const field = WRITE_TOOL_PATH_FIELDS[payload.tool_name];
  if (!field) return null;
  const value = payload.tool_input && payload.tool_input[field];
  return typeof value === "string" && value ? value : null;
}

module.exports = {
  readSessionId: (payload) => payload.session_id,
  readCwd: (payload) => payload.cwd,
  // CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE, measured on its own export.
  vendorField: "session.id",
  stepStart: {
    skillName: skillNameFromArgument({
      toolField: "tool_name",
      toolName: "Skill",
      argumentsField: "tool_input",
      nameField: "skill",
    }),
    turnIdField: "prompt_id",
  },
  // Claude Code alone: no other host was captured handing a path to a hook. A host without
  // one is not blind to tasks - file-writes.cjs's observed pass covers it - but a stated path
  // is exact where an observed one is inferred.
  writtenPath,
};
