#!/usr/bin/env node
// Entry point for the run journal: read stdin, detect the host, dispatch by event, exit 0
// no matter what. The work itself lives in hooks/lib/.

const fs = require("node:fs");

const { detectHost } = require("./lib/host.js");
const repo = require("./lib/repo.js");
const record = require("./lib/record.js");
const fileWrites = require("./lib/file-writes.js");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const CANONICAL_EVENTS = new Set(["session-start", "turn-end", "file-written"]);

// hook_event_name spellings observed per tool, consulted only as a fallback.
const HOOK_EVENT_NAME_TO_CANONICAL = Object.freeze({
  SessionStart: "session-start",
  sessionStart: "session-start", // Cursor, Copilot
  Stop: "turn-end",
  stop: "turn-end", // Cursor
  PostToolUse: "file-written",
  postToolUse: "file-written", // Cursor, Copilot
});

// Argv carries the event name because Copilot's payload has none at all.
function resolveEventName(argvEvent, payload) {
  if (CANONICAL_EVENTS.has(argvEvent)) return argvEvent;
  return HOOK_EVENT_NAME_TO_CANONICAL[payload && payload.hook_event_name] || null;
}

function processPayload(payload, event) {
  const host = detectHost(payload);
  if (host !== "claude-code") return;

  // Otherwise JSON.stringify silently drops an undefined vendor_id, leaving a line
  // missing the key every later join depends on.
  if (typeof payload.session_id !== "string" || payload.session_id === "") return;

  const resolvedEvent = resolveEventName(event, payload);
  if (resolvedEvent === "session-start") {
    record.handleSessionStart(payload, host);
  } else if (resolvedEvent === "turn-end") {
    record.handleTurnEnd(payload);
  } else if (resolvedEvent === "file-written") {
    fileWrites.handleFileWritten(payload, host);
  }
}

function main() {
  try {
    const raw = readStdin();
    const payload = raw ? JSON.parse(raw) : null;
    processPayload(payload, process.argv[2]);
  } catch {
    // Exit 0 no matter what: a measurement layer that breaks a session is worse than one
    // that misses a session.
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  detectHost,
  parseOwnerRepoFromRemote: repo.parseOwnerRepoFromRemote,
  sanitizeProjectId: repo.sanitizeProjectId,
  runsDir: repo.runsDir,
  telemetryEnabled: repo.telemetryEnabled,
  generateUlid: record.generateUlid,
  findRunFileByVendorId: record.findRunFileByVendorId,
  looksLikeTaskPath: fileWrites.looksLikeTaskPath,
  processPayload,
  resolveEventName,
};
