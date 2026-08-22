// OpenCode's own extension surface: a JS module it loads in-process through its
// `{plugin,plugins}/*.{ts,js}` auto-discovery convention - never a hook it spawns per event,
// which is why every other file in this directory (a command journal.js runs, reading stdin)
// has no counterpart here.
//
// The export shape below is load-bearing, not style: OpenCode's loader only recognises a
// genuine ESM export. Measured across three real sessions, a CommonJS `module.exports` file
// sat in the auto-discovery path, was logged as found, and never ran a single line of its own
// code - no error, no output. An `export const` file loaded and ran on the very next attempt.
//
// A second, separate limit rules out reusing journal.js's own functions in-process: OpenCode's
// loader cannot see a local CommonJS file's exports at all - `await import("./lib/record.js")`
// resolves to a namespace with none, even for a trivial one-line `module.exports = {...}` file,
// while a genuine ESM sibling imports fine. So this file spawns `journal.js` as the child
// process every other host's own hook already runs, over the same stdin-JSON contract, naming
// itself so `detectHost` (lib/host.js) recognises it without guessing at a fifth vendor shape.
// See measurements.md, phase 5, for both captures.
//
// A third gap, found only by running a real session (phase 7): `node <a file:// URL>` is
// not a valid invocation - Node's CLI treats the string as a module specifier and resolves
// it relative to its own cwd, not as an absolute script path, so the spawned process died
// with MODULE_NOT_FOUND every time and journal.js never ran. fileURLToPath fixes it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JOURNAL_SCRIPT = fileURLToPath(new URL("./journal.js", import.meta.url));

// Never `process.execPath`: OpenCode ships as its own standalone binary, so that path names
// `opencode` itself, not a Node runtime that can run journal.js.
function runJournal(event, payload) {
  spawnSync("node", [JOURNAL_SCRIPT, event], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

// `session.created` carries the session's own `info.directory`, set by OpenCode itself;
// `session.idle` carries only `sessionID`. A single server can outlive many sessions and
// serve more than one directory (`opencode run --dir`, `--attach`), so `input.directory` -
// this plugin instance's own init-time directory, fixed once - is not a safe stand-in: a
// turn-end written to the wrong project's journal finds no run file and silently no-ops.
// Cached per session id instead, from the one event that actually carries it.
const directoryBySessionId = new Map();

export const AiddTelemetry = async (input) => ({
  event: async ({ event }) => {
    if (event.type === "session.created") {
      const sessionId = event.properties.info.id;
      const cwd = event.properties.info.directory;
      directoryBySessionId.set(sessionId, cwd);
      runJournal("session-start", { tool: "opencode", session_id: sessionId, cwd });
    } else if (event.type === "session.idle") {
      const sessionId = event.properties.sessionID;
      const cwd = directoryBySessionId.get(sessionId) ?? input.directory;
      runJournal("turn-end", { tool: "opencode", session_id: sessionId, cwd });
    }
  },
});
