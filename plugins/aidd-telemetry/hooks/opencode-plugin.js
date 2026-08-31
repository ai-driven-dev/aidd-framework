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
// See scripts/__tests__/fixtures/opencode-session-idle.json and its README entry for the
// captured evidence behind this shape.
//
// A third gap, found only by running a real session: `node <a file:// URL>` is not a valid
// invocation - Node's CLI treats the string as a module specifier and resolves it relative
// to its own cwd, not as an absolute script path, so the spawned process died with
// MODULE_NOT_FOUND every time and journal.js never ran. fileURLToPath fixes it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JOURNAL_SCRIPT = fileURLToPath(new URL("./journal.cjs", import.meta.url));

// Never `process.execPath`: OpenCode ships as its own standalone binary, so that path names
// `opencode` itself, not a Node runtime that can run journal.js.
function runJournal(event, payload) {
  spawnSync("node", [JOURNAL_SCRIPT, event], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

// `session.created` carries the session's own `info.directory`, set by OpenCode itself;
// `session.idle` and `message.part.updated` carry only `sessionID`. A single server can
// outlive many sessions and serve more than one directory (`opencode run --dir`,
// `--attach`), so `input.directory` - this plugin instance's own init-time directory, fixed
// once - is not a safe stand-in: a turn-end or a declaration written to the wrong project's
// journal finds no run file and silently no-ops. Cached per session id instead, from the
// one event that actually carries it.
//
// `session.created` was never observed reaching this hook in a live `opencode 1.14.20`
// measurement (2026-08-31) that discriminates "never published" from "published but not
// delivered" - see the fixtures' own README entry for that run's log and two further
// attempts that could not distinguish the two.
//
// Every `opencode run` invocation is a first session, so this cache stays empty for it in
// practice today, and `session.idle`/`message.part.updated` fall back to `input.directory`
// below - this plugin's own init-time directory, which happens to be correct for the
// single-directory case `opencode run` is. The plugin README already named this limit
// ("OpenCode misses a server process's first session"); this comment is the same fact,
// now anchored to a measurement rather than left as an assertion.
const directoryBySessionId = new Map();

// Mirrors `lib/task-declared.cjs`'s own `TASK_PATH_PATTERN` and `lib/host.cjs`'s
// `stringsWithin`, duplicated rather than imported: this file's own top-of-file comment
// already measured that OpenCode's loader cannot see a local CommonJS file's exports at
// all, which is the reason this plugin spawns `journal.cjs` as a child process in the
// first place rather than calling its functions in-process. That constraint applies here
// too - the same import that never worked for `record.cjs` would not work for
// `task-declared.cjs` either.
const TASK_PATH_PATTERN =
  /aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\/[^"'\s]*|aidd_docs\/tasks\/\d{4}_\d{2}\/[^/"'\s]+\.md/u;

// Every completed tool part reaches this hook - most naming no task at all - and, unlike
// every other host's own hook runner, this one runs inside OpenCode's own in-process event
// handler: a `spawnSync` per call here blocks the agent's own event loop, not a
// short-lived hook process the host expects to pay for anyway. Cheap and conservative:
// `true` only when a string reachable inside `toolInput` could possibly be a declared
// path, exactly what `declaredTaskPath` would itself test after the spawn - so this can
// never skip a call `handleTaskDeclared` would have acted on, only calls it would have
// read and discarded.
function mightDeclareATask(toolInput) {
  if (typeof toolInput === "string") {
    return TASK_PATH_PATTERN.test(toolInput.replace(/\\/gu, "/"));
  }
  if (!toolInput || typeof toolInput !== "object") return false;
  return Object.values(toolInput).some(mightDeclareATask);
}

// A tool call's own arguments, once it has any: `pending` carries `input: {}`, empty and
// unsearchable, before OpenCode has resolved what the call is even for - only `completed`
// is read, the moment every argument, and the tool's own output, are settled, the same
// moment every other host's own PostToolUse-style hook fires at. Reading `running` too
// would call `handleTaskDeclared` a second time for the one real call already caught at
// `completed` - never wrong, since a duplicate declaration is a duplicate closed interval
// pointing at the same path, but a needless one.
//
// Measured live, `opencode 1.14.20`, 2026-08-31: a tool part's own `event.properties.part`
// carries no task identity of any kind - only `tool` (a name: `"read"`, `"bash"`, …) and
// `state.input`, the call's own arguments, exactly the shape `declaredTaskPath` already
// reads on every other host as `tool_input`. `state.input.filePath` (a `read` call) and
// `state.input.command` (a `bash` call) were both observed carrying an absolute path or a
// shell command line - the same two shapes Claude Code's `Read` and Codex's `Bash` already
// give this reader, never a new field this reader has to learn.
//
// `mightDeclareATask` is read before this ever produces a call worth spawning for: on
// OpenCode, `tool-used` does exactly one thing downstream (`journal.cjs`'s own
// `handleFileWritten` and `handleStepStart` both no-op for a host with no `writtenPath` /
// `stepStart` extractor - see `lib/tools/opencode.cjs`) - task declaration - so a call this
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

/** One OpenCode event in, the journal call it produces out - or `null` for an event this
 * plugin does not act on. Pure but for the one map mutation `session.created` makes on
 * its way through: kept separate from `runJournal`'s spawn so a captured event can be
 * asserted against without running node as a child process. */
export function journalCallFor(event, sessionDirectories, fallbackDirectory) {
  if (event.type === "session.created") {
    const sessionId = event.properties.info.id;
    const cwd = event.properties.info.directory;
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

export const AiddTelemetry = async (input) => ({
  event: async ({ event }) => {
    const call = journalCallFor(event, directoryBySessionId, input.directory);
    if (call) runJournal(call.script, call.payload);
  },
});
