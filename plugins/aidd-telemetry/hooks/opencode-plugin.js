// OpenCode's own extension surface: a JS module it loads in-process through its
// `{plugin,plugins}/*.{ts,js}` auto-discovery convention, never a hook it spawns per event.
//
// The export shape is load-bearing, not style: OpenCode's loader only recognises a genuine
// ESM export. A CommonJS `module.exports` file sits in the auto-discovery path, is logged as
// found, and never runs a line of its own code - no error, no output.
//
// A second limit rules out reusing journal.cjs's functions in-process: OpenCode's loader
// cannot see a local CommonJS file's exports at all, so `await import("./lib/record.cjs")`
// resolves to an empty namespace while a genuine ESM sibling imports fine. So this spawns
// `journal.cjs` as a child over the same stdin-JSON contract every other host's hook uses,
// naming itself so `detectHost` recognises it without guessing at a fifth vendor shape.
//
// `node <a file:// URL>` is not a valid invocation - Node treats the string as a module
// specifier resolved against its own cwd - so fileURLToPath is what makes the spawn work.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JOURNAL_SCRIPT = fileURLToPath(new URL("./journal.cjs", import.meta.url));

// Never `process.execPath`: OpenCode ships as its own standalone binary, so that path names
// `opencode` itself, not a Node runtime that can run journal.cjs.
//
// This runs in-process, not as a host-spawned hook OpenCode expects to wait on, so `timeout`
// bounds the block: a `journal.cjs` that hangs must not freeze OpenCode's event loop, and a
// killed run is one missed measurement.
function runJournal(event, payload) {
  spawnSync("node", [JOURNAL_SCRIPT, event], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 5000,
  });
}

// Only `session.created` carries the session's own `info.directory`; the other events carry
// `sessionID` alone. A single server can outlive many sessions and serve more than one
// directory, so this plugin's fixed init-time directory is not a safe stand-in - a turn-end
// written to the wrong project's journal finds no run file and silently no-ops.
//
// `session.created` was never observed reaching this hook, and every `opencode run` is a
// session OpenCode never announced, so the later events fall back to the init-time directory,
// which is correct for the single-directory case `opencode run` is. `journalCallsFor` writes
// it back here, so the session is opened once and every later event reads the same directory.
const directoryBySessionId = new Map();

// Mirrors `lib/task-declared.cjs`'s own `TASK_PATH_PATTERN`, duplicated rather than
// imported: OpenCode's loader cannot see a local CommonJS file's exports at all, which is the
// same constraint that makes this plugin spawn `journal.cjs` rather than call into it.
const TASK_PATH_PATTERN =
  /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\/[^"'\s]*|aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\.md/u;

// Every completed tool part reaches this hook, most naming no task, and a `spawnSync` per
// call blocks OpenCode's own event loop. Cheap and conservative: `true` only when a string
// inside `toolInput` could possibly be a declared path, which is what `declaredTaskPath`
// tests after the spawn, so this can never skip a call that would have been acted on.
function mightDeclareATask(toolInput) {
  if (typeof toolInput === "string") {
    return TASK_PATH_PATTERN.test(toolInput.replace(/\\/gu, "/"));
  }
  if (!toolInput || typeof toolInput !== "object") return false;
  return Object.values(toolInput).some(mightDeclareATask);
}

// Only `completed` is read: `pending` carries an empty, unsearchable `input`, and reading
// `running` too would declare the same task twice for one call.
//
// A tool part carries no task identity of any kind - only the tool's name and `state.input`,
// the call's own arguments, which is exactly the shape `declaredTaskPath` already reads on
// every other host as `tool_input`.
//
// On OpenCode `tool-used` does exactly one thing downstream, task declaration, so a call this
// pre-filter refuses would have done nothing after the spawn either.
function declaredTaskCallFor(event, sessionDirectories, fallbackDirectory) {
  const part = event.properties.part;
  if (part?.type !== "tool" || part.state?.status !== "completed") return null;
  if (!mightDeclareATask(part.state.input)) return null;
  const sessionId = event.properties.sessionID;
  const cwd = sessionDirectories.get(sessionId) ?? fallbackDirectory;
  return {
    script: "tool-used",
    payload: { tool: "opencode", session_id: sessionId, cwd, tool_input: part.state.input },
  };
}

/** Kept separate from `runJournal`'s spawn so a captured event can be asserted against
 * without running node as a child process.
 *
 * Reached as a property of the plugin below, never as a second named export: OpenCode's
 * loader calls every function-valued export of a file in `plugin/` as a plugin factory of its
 * own, and doing that to this function left `opencode run` dead before any session started. */
function journalCallFor(event, sessionDirectories, fallbackDirectory) {
  if (event.type === "session.created") {
    const sessionId = event.properties?.info?.id;
    const cwd = event.properties?.info?.directory;
    sessionDirectories.set(sessionId, cwd);
    return { script: "session-start", payload: { tool: "opencode", session_id: sessionId, cwd } };
  }
  if (event.type === "session.idle") {
    const sessionId = event.properties.sessionID;
    const cwd = sessionDirectories.get(sessionId) ?? fallbackDirectory;
    return { script: "turn-end", payload: { tool: "opencode", session_id: sessionId, cwd } };
  }
  if (event.type === "message.part.updated") {
    return declaredTaskCallFor(event, sessionDirectories, fallbackDirectory);
  }
  return null;
}

/** Nothing on OpenCode's bus guarantees `properties` is set, and an event this plugin does
 * not act on is read here before any per-type dispatch would skip it, so a missing field must
 * resolve to `undefined` rather than throw. */
function sessionIdOf(event) {
  if (event.type === "session.created") return event.properties?.info?.id;
  return event.properties?.sessionID;
}

/** Every journal call one OpenCode event produces, in the order the journal must receive
 * them.
 *
 * OpenCode publishes `session.created` on its own bus and never delivers it to a plugin's
 * event hook, and `opencode run` is always such a session — so `journalCallFor` alone leaves
 * the journal with no `session_start`, no run file, and every later line dropped, while the
 * tool still reads as covered.
 *
 * So the first call for a session nobody announced opens it, carrying the directory that
 * call was already going to use rather than a new guess. An announced session is untouched,
 * and no session is opened twice. */
function journalCallsFor(event, sessionDirectories, fallbackDirectory) {
  const sessionId = sessionIdOf(event);
  const announced = sessionId !== undefined && sessionDirectories.has(sessionId);
  const call = journalCallFor(event, sessionDirectories, fallbackDirectory);
  if (call === null) return [];
  if (announced || call.script === "session-start") return [call];
  sessionDirectories.set(sessionId, call.payload.cwd);
  const opening = { tool: "opencode", session_id: sessionId, cwd: call.payload.cwd };
  return [{ script: "session-start", payload: opening }, call];
}

export const AiddTelemetry = async (input) => ({
  event: async ({ event }) => {
    // The rule journal.cjs's own main() states, applied where OpenCode calls this in-process
    // instead of spawning it: a measurement layer that breaks a session is worse than one
    // that misses one, and whatever throws here is this plugin's fault, never the person's.
    try {
      for (const call of journalCallsFor(event, directoryBySessionId, input.directory)) {
        runJournal(call.script, call.payload);
      }
    } catch {
      // Silent on purpose - see above.
    }
  },
});

// The spawn-free test seams, hung off the one export rather than standing beside it — see
// journalCallFor's own comment for why a second export is ruled out.
AiddTelemetry.journalCallFor = journalCallFor;
AiddTelemetry.journalCallsFor = journalCallsFor;
