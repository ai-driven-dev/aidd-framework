// The only place that maps a host name to what the journal knows about it. Adding a host
// is adding a file beside these five plus one line below - never a new branch anywhere
// else, and never a new table alongside this one.

const claudeCode = require("./claude-code.js");
const codex = require("./codex.js");
const copilot = require("./copilot.js");
const cursor = require("./cursor.js");
const opencode = require("./opencode.js");

const TOOLS_BY_HOST = Object.freeze({
  "claude-code": claudeCode,
  codex,
  copilot,
  cursor,
  opencode,
});

function toolFor(host) {
  return TOOLS_BY_HOST[host] || null;
}

// Read behind the host's own declaration, never one host's spelling promoted to a rule -
// the two facts every caller needs regardless of which other fact it is also after.
function readSessionId(host, payload) {
  const tool = toolFor(host);
  return tool ? tool.readSessionId(payload) : undefined;
}

function readCwd(host, payload) {
  const tool = toolFor(host);
  return tool ? tool.readCwd(payload) : undefined;
}

module.exports = { TOOLS_BY_HOST, toolFor, readSessionId, readCwd };
