// Every other tool has between three and eight captures behind its reader. OpenCode had
// none - its coverage was asserted from a doc comment (`plugin README.md`'s "OpenCode
// misses a server process's first session"), never from a payload. This file replaces that
// with two: a real capture of `session.idle`, and `session.created` reconstructed from a
// verified SDK type declaration plus a genuinely captured sibling event - see
// fixtures/README.md's "OpenCode's two plugin events" for exactly what each one rests on
// and does not.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const { detectHost } = require("../../plugins/aidd-telemetry/hooks/lib/host.cjs");

const PLUGIN_SOURCE = path.resolve(
  __dirname,
  "../../plugins/aidd-telemetry/hooks/opencode-plugin.js",
);
const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

// A byte-identical `.mjs` twin, for this file alone - the same reason
// opencode-plugin.test.js's own `makeInstalledRepo` keeps one: this repository declares no
// `"type": "module"` anywhere up the tree, so plain Node's `import()` would read
// `opencode-plugin.js` as CommonJS and choke on its `export` syntax. OpenCode's own loader
// does not consult that field at all - the extension is the only thing that differs from
// what ships.
let journalCallForPromise;
async function journalCallFor() {
  if (!journalCallForPromise) {
    const twin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aidd-opencode-payloads-")), "opencode-plugin.mjs");
    fs.copyFileSync(PLUGIN_SOURCE, twin);
    journalCallForPromise = import(pathToFileURL(twin).href).then((mod) => mod.journalCallFor);
  }
  return journalCallForPromise;
}

test("session.idle, captured live, turns into a turn-end call the journal recognises as opencode", async () => {
  const builder = await journalCallFor();
  const event = loadFixture("opencode-session-idle.json");

  const call = builder(event, new Map(), "/home/user/fallback");

  assert.deepEqual(call, {
    script: "turn-end",
    payload: {
      tool: "opencode",
      session_id: "ses_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      cwd: "/home/user/fallback",
    },
  });
  assert.equal(detectHost(call.payload), "opencode");
});

test("session.created turns into a session-start call the journal recognises as opencode", async () => {
  const builder = await journalCallFor();
  const event = loadFixture("opencode-session-created.json");

  const call = builder(event, new Map(), "/home/user/fallback");

  assert.deepEqual(call, {
    script: "session-start",
    payload: {
      tool: "opencode",
      session_id: "ses_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      cwd: "/home/user/probe/project",
    },
  });
  assert.equal(detectHost(call.payload), "opencode");
});

test("the directory session.created names survives to session.idle's own turn-end call, since session.idle cannot supply one", async () => {
  const builder = await journalCallFor();
  const created = loadFixture("opencode-session-created.json");
  const idle = loadFixture("opencode-session-idle.json");
  const sessionDirectories = new Map();

  builder(created, sessionDirectories, "/home/user/fallback");
  const turnEnd = builder(idle, sessionDirectories, "/home/user/fallback");

  assert.equal(turnEnd.payload.cwd, created.properties.info.directory);
  assert.notEqual(turnEnd.payload.cwd, "/home/user/fallback");
});

test("session.idle falls back to the plugin's own init-time directory when no session.created ever named one", async () => {
  const builder = await journalCallFor();
  const idle = loadFixture("opencode-session-idle.json");

  const turnEnd = builder(idle, new Map(), "/home/user/fallback");

  assert.equal(turnEnd.payload.cwd, "/home/user/fallback");
});

test("a second session.created on one server keeps its own directory, never overwriting the first", async () => {
  const builder = await journalCallFor();
  const first = loadFixture("opencode-session-created.json");
  const second = {
    type: "session.created",
    properties: {
      info: {
        ...first.properties.info,
        id: "ses_bbbbbbbbbbbbbbbbbbbbbbbbbb",
        directory: "/home/user/probe/other-project",
      },
    },
  };
  const sessionDirectories = new Map();

  const firstCall = builder(first, sessionDirectories, "/home/user/fallback");
  const secondCall = builder(second, sessionDirectories, "/home/user/fallback");
  const firstIdle = builder(
    { type: "session.idle", properties: { sessionID: first.properties.info.id } },
    sessionDirectories,
    "/home/user/fallback",
  );
  const secondIdle = builder(
    { type: "session.idle", properties: { sessionID: second.properties.info.id } },
    sessionDirectories,
    "/home/user/fallback",
  );

  assert.equal(firstCall.payload.cwd, first.properties.info.directory);
  assert.equal(secondCall.payload.cwd, second.properties.info.directory);
  assert.equal(firstIdle.payload.cwd, first.properties.info.directory);
  assert.equal(secondIdle.payload.cwd, second.properties.info.directory);
});

test("an event this plugin does not act on produces no journal call", async () => {
  const builder = await journalCallFor();

  assert.equal(builder({ type: "message.updated", properties: {} }, new Map(), "/x"), null);
});
