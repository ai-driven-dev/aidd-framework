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
  // Measured 2026-08-13, on the invoke_agent span.
  vendorField: "gen_ai.conversation.id",
  stepStart: {
    // Canonical builder: toolName/toolArgs, toolArgs a JSON string. _vsCodeCompat builder,
    // captured 2026-08-22 against a real @github/copilot@1.0.80 skill call: tool_name
    // stays the canonical "skill" spelling, but tool_input arrives as an object keyed
    // like Claude Code's own tool_input.skill, not like the canonical builder's
    // JSON-string toolArgs. Neither was guessed; both came from a captured payload.
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
