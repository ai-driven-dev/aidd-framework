// What each tool's own files hold for one session, normalised into one shape.
//
// Every field name and every quirk below was measured against a captured file, never taken
// from documentation. Where two tools spell the same quantity differently, the difference
// is absorbed here so nothing downstream knows which tool it is reading.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const OPENCODE_BINARY = "opencode";
const OPENCODE_TIMEOUT_MS = 10000;
const OPENCODE_SESSION_NOT_FOUND = /session not found/i;

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split("\n");
  } catch {
    return [];
  }
}

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else if (entry.isFile()) onFile(full);
  }
}

function asNumber(value) {
  return typeof value === "number" ? value : undefined;
}

function asString(value) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function withCounters(record, counters) {
  for (const [field, value] of Object.entries(counters)) {
    if (value !== undefined) record[field] = value;
  }
  return record;
}

// Claude Code -----------------------------------------------------------------------

// One assistant message per line, but several lines can share a `requestId` - one billed
// call streamed in parts. Keyed on it, so a call counted once is a call counted once.
function claudeRecords(content, sessionId) {
  const byRequest = new Map();
  for (const raw of content.split("\n")) {
    const line = raw.trim() === "" ? null : parseLine(raw);
    if (!line || line.type !== "assistant") continue;
    const requestId = asString(line.requestId);
    const usage = line.message && line.message.usage;
    if (!requestId || !usage || byRequest.has(requestId)) continue;
    const step = asString(line.attributionSkill);
    byRequest.set(
      requestId,
      withCounters(
        {
          kind: "request",
          vendor_id: sessionId,
          vendor_field: "sessionId",
          turn_id: requestId,
          turn_field: "requestId",
          ...(asString(line.message.model) === undefined
            ? {}
            : { model: asString(line.message.model) }),
          ...(asString(line.effort) === undefined ? {} : { effort: asString(line.effort) }),
          ...(asString(line.timestamp) === undefined
            ? {}
            : { event_timestamp: asString(line.timestamp) }),
          // Only on a sidechain: a main-transcript line can carry the attribute while the
          // request it describes was not a subagent's.
          ...(line.isSidechain === true && asString(line.attributionAgent) !== undefined
            ? { agent_name: asString(line.attributionAgent) }
            : {}),
          // Absent means no skill ran *or* the tool predates the field. Neither may be
          // asserted, so absence yields no step at all rather than a placeholder.
          ...(step === undefined ? {} : { step }),
          ...(step !== undefined && asString(line.attributionPlugin) !== undefined
            ? { step_plugin: asString(line.attributionPlugin) }
            : {}),
        },
        {
          input_tokens: asNumber(usage.input_tokens),
          output_tokens: asNumber(usage.output_tokens),
          cache_read_tokens: asNumber(usage.cache_read_input_tokens),
          cache_creation_tokens: asNumber(usage.cache_creation_input_tokens),
        }
      )
    );
  }
  return [...byRequest.values()];
}

// A session's transcript is its own file plus one per subagent it launched.
function claudeRead(homeDir, sessionId) {
  const root = path.join(homeDir, ".claude", "projects");
  const records = [];
  let found = false;
  walk(root, (file) => {
    const relative = path.relative(root, file);
    const base = path.basename(relative);
    const inSubagents = relative.includes(`${sessionId}${path.sep}subagents${path.sep}`);
    if (base !== `${sessionId}.jsonl` && !(inSubagents && base.endsWith(".jsonl"))) return;
    found = true;
    records.push(...claudeRecords(fs.readFileSync(file, "utf8"), sessionId));
  });
  return { records, sessionFound: found };
}

// Codex -----------------------------------------------------------------------------

// `last_token_usage` is this call's own increment; `total_token_usage` is cumulative, and
// summing the totals would count every call after the first again. `input_tokens` here is
// *inclusive* of `cached_input_tokens`, unlike Claude Code's - subtracting is what keeps
// the field meaning the same thing across tools. `reasoning_output_tokens` is a subset of
// `output_tokens`, never a sibling.
function codexRecords(content, sessionId) {
  const records = [];
  let pending = null;
  const flush = () => {
    if (pending && pending.counted) records.push(pending.record);
    pending = null;
  };
  for (const raw of content.split("\n")) {
    const line = raw.trim() === "" ? null : parseLine(raw);
    if (!line) continue;
    if (line.type === "turn_context") {
      flush();
      const turnId = asString(line.payload && line.payload.turn_id);
      if (!turnId) continue;
      pending = {
        counted: false,
        record: {
          kind: "request",
          vendor_id: sessionId,
          vendor_field: "session_meta.id",
          turn_id: turnId,
          turn_field: "turn_id",
          ...(asString(line.payload.model) === undefined
            ? {}
            : { model: asString(line.payload.model) }),
          ...(asString(line.payload.effort) === undefined
            ? {}
            : { effort: asString(line.payload.effort) }),
          // The turn's own start, from this line rather than from a counted event inside
          // it: a record covers a whole turn, and a moment within it would claim a
          // precision the record does not have.
          ...(asString(line.timestamp) === undefined
            ? {}
            : { event_timestamp: asString(line.timestamp) }),
        },
      };
      continue;
    }
    const usage =
      line.type === "event_msg" &&
      line.payload &&
      line.payload.type === "token_count" &&
      line.payload.info &&
      line.payload.info.last_token_usage;
    if (!usage || !pending) continue;
    pending.counted = true;
    addCodexUsage(pending.record, usage);
  }
  flush();
  return records;
}

function addCodexUsage(record, usage) {
  const cached = asNumber(usage.cached_input_tokens) ?? 0;
  const add = (field, value) => {
    if (value !== undefined) record[field] = (record[field] ?? 0) + value;
  };
  // Added in the order every reader lists them, so one tool's record and another's
  // serialise the same way and equivalence can be asserted byte for byte.
  const input = asNumber(usage.input_tokens);
  add("input_tokens", input === undefined ? undefined : input - cached);
  add("output_tokens", asNumber(usage.output_tokens));
  add("cache_read_tokens", asNumber(usage.cached_input_tokens));
  add("cache_creation_tokens", asNumber(usage.cache_write_input_tokens));
}

// A rollout's own trailing uuid is its `session_meta.id`, which is what a resumed session
// is keyed on - `session_meta.session_id` there names the parent.
function codexRead(homeDir, sessionId) {
  const root = path.join(homeDir, ".codex", "sessions");
  const records = [];
  let found = false;
  walk(root, (file) => {
    const base = path.basename(file);
    if (!base.startsWith("rollout-") || !base.endsWith(`-${sessionId}.jsonl`)) return;
    found = true;
    records.push(...codexRecords(fs.readFileSync(file, "utf8"), sessionId));
  });
  return { records, sessionFound: found };
}

// OpenCode ----------------------------------------------------------------------------

// Read by shelling out rather than by opening its SQLite database: a native dependency
// would need a prebuild per platform to serve the fraction of users who run OpenCode.
function opencodeRead(_homeDir, sessionId) {
  const onPath = (process.env.PATH ?? "")
    .split(path.delimiter)
    .some((dir) => dir !== "" && fs.existsSync(path.join(dir, OPENCODE_BINARY)));
  if (!onPath) return { records: [], sessionFound: false };

  const result = spawnSync(OPENCODE_BINARY, ["export", sessionId, "--sanitize"], {
    timeout: OPENCODE_TIMEOUT_MS,
    encoding: "utf-8",
  });
  if (result.error) throw new Error(`${OPENCODE_BINARY} export ${sessionId}: ${result.error.message}`);
  if (result.status !== 0) {
    if (OPENCODE_SESSION_NOT_FOUND.test(result.stderr ?? "")) {
      return { records: [], sessionFound: false };
    }
    throw new Error(`${OPENCODE_BINARY} export ${sessionId} exited ${result.status}`);
  }
  const payload = parseLine(result.stdout);
  if (!payload) throw new Error(`${OPENCODE_BINARY} export ${sessionId}: unreadable output`);
  return { records: opencodeRecords(payload, sessionId), sessionFound: true };
}

// `info.cost` is deliberately never read: it is `0` in every message captured, and its
// denomination was never established. A figure whose meaning is unknown is worse than an
// absent one.
function opencodeRecords(payload, sessionId) {
  const records = [];
  for (const message of payload.messages ?? []) {
    const info = message.info ?? {};
    if (info.tokens === undefined) continue;
    const created = asNumber(info.time && info.time.created);
    const turnId = asString(info.id);
    records.push(
      withCounters(
        {
          kind: "request",
          vendor_id: sessionId,
          vendor_field: "sessionID",
          ...(turnId === undefined ? {} : { turn_id: turnId, turn_field: "id" }),
          ...(asString(info.modelID) === undefined ? {} : { model: asString(info.modelID) }),
          ...(created === undefined || created <= 0
            ? {}
            : { event_timestamp: new Date(created).toISOString() }),
        },
        {
          input_tokens: asNumber(info.tokens.input),
          output_tokens: asNumber(info.tokens.output),
          cache_read_tokens: asNumber(info.tokens.cache && info.tokens.cache.read),
          cache_creation_tokens: asNumber(info.tokens.cache && info.tokens.cache.write),
        }
      )
    );
  }
  return records;
}

// -------------------------------------------------------------------------------------

/**
 * Every AI tool, what each was **measured** to supply on each route, and how to read the
 * one that can be. Adding a tool is an entry here; nothing else in this directory knows a
 * tool by name.
 *
 * `null` for a route means the tool declares no such route at all, which is not the same
 * as a declared route that supplies nothing. `journalAttributable` false means two things
 * at once: no step can come from an interval, and a read that sweeps the journal never
 * reaches one of that tool's sessions.
 */
const TOOLS = [
  {
    tool: "claude",
    read: claudeRead,
    capability: {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: true },
      export: { tokenCounters: true, amount: true, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: true,
    },
  },
  {
    tool: "cursor",
    // Measured, not assumed: the plugin-scope hooks.json the framework currently installs
    // to (~/.cursor/plugins/local/<plugin>/) never fired, across three probes that varied
    // every axis that could explain it away — headless and interactive, auto-discovered
    // and loaded explicitly with --plugin-dir, with and without a .cursor-plugin/
    // plugin.json manifest matching Cursor's own schema. Zero of seven declared events
    // fired on any of them.
    //
    // But a project-scope .cursor/hooks.json does fire, and a live interactive session run
    // through it - the real journal.js, the real command the framework's own `cursor:flat`
    // build target produces - wrote a genuine run journal file: session_start with Cursor's
    // real session id, then turn_end from a real `stop`. journalAttributable is a fact
    // about the journal, not about which directory is currently installed to, and the
    // journal does reach a Cursor session when the hook is wired to run under it. The
    // shipped native/plugin-scope install not firing is a route defect - the same class as
    // the other four tools once had - not a capability limit. See measurements.md, phase 4.
    reason: "It writes no token count in any file it produces.",
    capability: {
      localRead: null,
      export: null,
      journalAttributable: true,
      taskAttributable: false,
    },
  },
  {
    tool: "copilot",
    reason:
      "Its file carries outputTokens per turn and nothing else \u2014 no per-request " +
      "input figure exists to build a record from.",
    capability: {
      localRead: null,
      export: { tokenCounters: false, amount: false, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: false,
    },
  },
  {
    tool: "opencode",
    read: opencodeRead,
    // journalAttributable is true on a live capture, not an argument: hooks/opencode-plugin.js,
    // an OpenCode plugin module loaded in-process (OpenCode has no hooks.json), writes
    // session_start from `session.created`'s own `info.id` and turn_end from `session.idle`.
    // A real session created through OpenCode's own HTTP API, with no --session named by hand,
    // was swept by this reader's own `read` sweep and joined - see measurements.md, phase 5.
    capability: {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
      export: null,
      journalAttributable: true,
      taskAttributable: false,
    },
  },
  {
    tool: "codex",
    read: codexRead,
    capability: {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
      export: { tokenCounters: false, amount: false, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: false,
    },
  },
];

const DISPLAY_NAME = {
  claude: "Claude Code",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  opencode: "OpenCode",
  codex: "Codex",
};

function homeDir() {
  return process.env.HOME || os.homedir();
}

module.exports = { TOOLS, DISPLAY_NAME, homeDir };
