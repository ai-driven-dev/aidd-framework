// Everything the journal knows about Copilot: two payload shapes for the same host (its
// canonical builder and the _vsCodeCompat one, see lib/host.cjs), so session id and step
// name each read behind both spellings. cwd is straight off the payload either way. No
// turn identifier ever arrives on a hook payload, and no written-path extractor - Copilot
// was never captured handing a path to a hook.

const { skillNameFromArgument, skillNameFromAnyArgument } = require("./skill-detection.cjs");

module.exports = {
  // sessionId is the canonical builder's spelling; session_id is the _vsCodeCompat
  // builder's - both are Copilot's own, never a fallback guess.
  readSessionId: (payload) => payload.sessionId ?? payload.session_id,
  readCwd: (payload) => payload.cwd,
  // Measured on the invoke_agent span.
  vendorField: "gen_ai.conversation.id",
  stepStart: {
    // The canonical builder spells them toolName/toolArgs, toolArgs a JSON string. The
    // _vsCodeCompat one keeps the "skill" tool name but delivers tool_input as an object,
    // keyed like Claude Code's. Neither was guessed; both came from a captured payload.
    skillName: skillNameFromAnyArgument([
      skillNameFromArgument({
        toolField: "toolName",
        toolName: "skill",
        argumentsField: "toolArgs",
        nameField: "skill",
      }),
      skillNameFromArgument({
        toolField: "tool_name",
        toolName: "skill",
        argumentsField: "tool_input",
        nameField: "skill",
      }),
    ]),
    turnIdField: null,
  },
  writtenPath: null,
};
