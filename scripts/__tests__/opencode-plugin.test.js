const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const PLUGIN_SOURCE = path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks/opencode-plugin.js");

const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

// Removed when the file finishes, not left behind: a suite that seeds a repository per run
// and never sweeps fills the machine's temp volume until mkdtemp itself fails with ENOSPC,
// which is how this was found - 1878 abandoned directories, 37 GB.
const tempDirs = [];
test.after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// Mirrors what a real install delivers: opencode-plugin.js copied verbatim beside
// journal.js and lib/ (see plugin-content-translator.ts, flatHooksFiles) - not the
// source tree, so this exercises the exact sibling-file layout OpenCode's loader sees.
function makeInstalledRepo() {
  const repo = makeTempDir("aidd-opencode-plugin-repo-");
  execFileSync("git", ["init", "-q"], { cwd: repo, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo, env: CLEAN_ENV });
  fs.mkdirSync(path.join(repo, "aidd_docs", "runs"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } }),
  );
  const pluginDir = path.join(repo, ".opencode", "plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  const hooksSrc = path.dirname(PLUGIN_SOURCE);
  for (const entry of fs.readdirSync(hooksSrc, { withFileTypes: true })) {
    if (entry.name === "hooks.json") continue;
    fs.cpSync(path.join(hooksSrc, entry.name), path.join(pluginDir, entry.name), { recursive: true });
  }
  // A byte-identical `.mjs` twin, for these tests alone. An install carries the plugin as
  // `.js` because OpenCode auto-discovers `{plugin,plugins}/*.{ts,js}` and nothing else, and
  // it loads the file with its own runtime, which does not consult Node's `type` field -
  // measured: with `hooks/`'s `"type": "commonjs"` marker in place, a real OpenCode session
  // still journals its session_start. These tests `import()` it with plain Node, which does
  // consult that marker, and a directory-wide override is not available: `journal.js` and
  // `lib/` are its CommonJS siblings in the same directory. The extension is the only thing
  // that differs from what ships.
  const esmTwin = path.join(pluginDir, "opencode-plugin.mjs");
  fs.copyFileSync(path.join(pluginDir, "opencode-plugin.js"), esmTwin);
  return { repo, pluginDir, esmTwin };
}

function runsDirOf(repo) {
  return path.join(repo, "aidd_docs", "runs");
}

function readRunLines(repo) {
  const dir = runsDirOf(repo);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  return files.flatMap((f) =>
    fs
      .readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );
}

test("opencode-plugin.js: runJournal spawns journal.js by an absolute filesystem path, not a file:// URL string", async () => {
  // Regression test for a real bug found only by running a live OpenCode session
  // (see measurements.md, Phase 7): `spawnSync("node", [new URL(...)])` stringifies
  // the URL to "file:///..." - node's CLI does not accept that as a script path, it
  // resolves it as a bare module specifier relative to its own cwd and dies with
  // MODULE_NOT_FOUND. journal.js silently never ran; no error surfaced anywhere
  // because journal.js's own "exit 0 no matter what" contract hid the spawn failure.
  const { repo, pluginDir, esmTwin } = makeInstalledRepo();
  const mod = await import(pathToFileURL(esmTwin).href);

  const hooks = await mod.AiddTelemetry({ directory: repo });
  await hooks.event({
    event: {
      type: "session.created",
      properties: { info: { id: "ses_test1234567890", directory: repo } },
    },
  });

  const lines = readRunLines(repo);
  assert.equal(lines.length, 1, "expected one session_start line written by journal.js");
  assert.equal(lines[0].type, "session_start");
  assert.equal(lines[0].tool, "opencode");
  assert.equal(lines[0].vendor_id, "ses_test1234567890");
});

test("opencode-plugin.js: session.idle writes turn_end for the session session.created named", async () => {
  const { repo, pluginDir, esmTwin } = makeInstalledRepo();
  const mod = await import(pathToFileURL(esmTwin).href);

  const hooks = await mod.AiddTelemetry({ directory: repo });
  await hooks.event({
    event: {
      type: "session.created",
      properties: { info: { id: "ses_test_idle", directory: repo } },
    },
  });
  await hooks.event({
    event: { type: "session.idle", properties: { sessionID: "ses_test_idle" } },
  });

  const lines = readRunLines(repo);
  assert.deepEqual(
    lines.map((l) => l.type),
    ["session_start", "turn_end"],
  );
});
