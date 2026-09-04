// How a step's skill name is found, in general - reused by more than one tool's own
// declaration, so it lives here rather than in any single one of them. Neither shape below
// names a host; each tool file passes in the field names its own payload actually uses.

const { normalizeSeparators, stringsWithin } = require("../host.cjs");

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

// Runs several argument-family readers in sequence, first name found wins. For one host
// whose own builder produces more than one payload shape - both genuinely that host's,
// never a guess at a third - rather than a fallback chain crossing families.
function skillNameFromAnyArgument(readers) {
  return (payload) => {
    for (const reader of readers) {
      const name = reader(payload);
      if (name) return name;
    }
    return null;
  };
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

module.exports = {
  SKILL_FILE_PATTERN,
  skillNameFromArgument,
  skillNameFromAnyArgument,
  skillNameFromSkillFileRead,
};
