const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which would point
// a child git call here at the real repository instead of the temporary one.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

const {
  pluginVersion,
  readManifestVersion,
  DEFAULT_MANIFEST_PATH,
} = require("../../plugins/aidd-telemetry/hooks/lib/plugin-version.cjs");

const REAL_MANIFEST_PATH = path.resolve(
  __dirname,
  "../../plugins/aidd-telemetry/.claude-plugin/plugin.json",
);
const REAL_PLUGIN_VERSION = JSON.parse(fs.readFileSync(REAL_MANIFEST_PATH, "utf8")).version;

const tempDirs = [];
test.after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

test("DEFAULT_MANIFEST_PATH resolves to this plugin's own real manifest, one directory from the hook", () => {
  assert.equal(DEFAULT_MANIFEST_PATH, REAL_MANIFEST_PATH);
});

test("readManifestVersion reads the real plugin's own declared version", () => {
  assert.equal(readManifestVersion(REAL_MANIFEST_PATH), REAL_PLUGIN_VERSION);
  assert.notEqual(REAL_PLUGIN_VERSION, undefined, "the fixture itself must carry a real version");
});

test("readManifestVersion never throws for a manifest that does not exist - it costs the version, not the caller", () => {
  const missing = path.join(makeTempDir("aidd-plugin-version-missing-"), "does-not-exist.json");
  assert.doesNotThrow(() => readManifestVersion(missing));
  assert.equal(readManifestVersion(missing), null);
});

test("readManifestVersion reads null for a manifest that is not valid JSON", () => {
  const dir = makeTempDir("aidd-plugin-version-invalid-json-");
  const manifestPath = path.join(dir, "plugin.json");
  fs.writeFileSync(manifestPath, "{ this is not json");

  assert.equal(readManifestVersion(manifestPath), null);
});

test("readManifestVersion reads null for valid JSON that names no usable version", () => {
  const dir = makeTempDir("aidd-plugin-version-no-field-");
  for (const [name, body] of [
    ["no-version-at-all.json", { name: "aidd-telemetry" }],
    ["version-not-a-string.json", { name: "aidd-telemetry", version: 2 }],
    ["version-empty-string.json", { name: "aidd-telemetry", version: "" }],
  ]) {
    const manifestPath = path.join(dir, name);
    fs.writeFileSync(manifestPath, JSON.stringify(body));
    assert.equal(readManifestVersion(manifestPath), null, `${name} must read as no version`);
  }
});

test("pluginVersion reads its own manifest at most once per process, reused on every later call", () => {
  const realReadFileSync = fs.readFileSync;
  let callsForDefaultManifest = 0;
  fs.readFileSync = (target, ...rest) => {
    if (target === DEFAULT_MANIFEST_PATH) callsForDefaultManifest += 1;
    return realReadFileSync(target, ...rest);
  };
  try {
    const first = pluginVersion();
    const second = pluginVersion();
    assert.equal(first, REAL_PLUGIN_VERSION);
    assert.equal(second, REAL_PLUGIN_VERSION);
    assert.ok(
      callsForDefaultManifest <= 1,
      `expected the manifest to be read at most once across two calls, read it ${callsForDefaultManifest} times`,
    );
  } finally {
    fs.readFileSync = realReadFileSync;
  }
});

// The integration half: journal.cjs run from a temporary copy of this plugin's own hooks/
// tree, so a missing manifest can be exercised without ever touching this repository's own
// real, committed plugin.json - the same copy-and-run technique
// plugin-install-shape.test.js and opencode-plugin.test.js already use for a structural
// concern neither this repo's real tree nor a fixture file alone can vary.
const HOOKS_SRC = path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks");
const REAL_CLAUDE_PLUGIN_DIR = path.resolve(__dirname, "../../plugins/aidd-telemetry/.claude-plugin");

/** A copy of `hooks/` plus `.claude-plugin/`, in the same relative layout a real install
 * carries them in - `hooks/lib/plugin-version.cjs`'s own `DEFAULT_MANIFEST_PATH` walks up
 * from `__dirname`, so this is what lets the copy's own manifest (present, corrupted, or
 * missing entirely, per `withManifest`) be the one it actually reads. */
function makePluginCopy(withManifest) {
  const pluginRoot = makeTempDir("aidd-plugin-version-copy-");
  fs.cpSync(HOOKS_SRC, path.join(pluginRoot, "hooks"), { recursive: true });
  if (withManifest === "valid") {
    fs.cpSync(REAL_CLAUDE_PLUGIN_DIR, path.join(pluginRoot, ".claude-plugin"), { recursive: true });
  } else if (withManifest === "corrupt") {
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "{ not json");
  }
  // withManifest === "absent": no .claude-plugin directory at all - the same shape a flat
  // per-tool translation delivers, which carries hooks/ with nothing of the plugin's own
  // manifest beside it (see opencode-plugin.test.js's makeInstalledRepo).
  return path.join(pluginRoot, "hooks", "journal.cjs");
}

function makeTempRepo() {
  const dir = makeTempDir("aidd-plugin-version-repo-");
  execFileSync("git", ["init", "-q"], { cwd: dir, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, env: CLEAN_ENV });
  fs.mkdirSync(path.join(dir, "aidd_docs", "runs"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled: true } }),
  );
  return dir;
}

function sessionStartPayload(cwd, sessionId) {
  return {
    session_id: sessionId,
    transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
    cwd,
    hook_event_name: "SessionStart",
    source: "startup",
  };
}

function readRunFileLines(repo) {
  const runsDir = path.join(repo, "aidd_docs", "runs");
  const [fileName] = fs.readdirSync(runsDir).filter((entry) => entry.endsWith(".jsonl"));
  assert.ok(fileName, "a session_start run file must be written regardless of the manifest");
  return fs
    .readFileSync(path.join(runsDir, fileName), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function runJournal(journalScript, repo, sessionId) {
  return spawnSync(process.execPath, [journalScript, "session-start"], {
    cwd: repo,
    encoding: "utf8",
    input: JSON.stringify(sessionStartPayload(repo, sessionId)),
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: "" },
  });
}

test("a plugin copy with its own real manifest beside it stamps the exact same version this process reads", () => {
  const journalScript = makePluginCopy("valid");
  const repo = makeTempRepo();

  const result = runJournal(journalScript, repo, "00000000-0000-4000-8000-0000000pv01");

  assert.equal(result.status, 0);
  const [sessionStart] = readRunFileLines(repo);
  assert.equal(sessionStart.type, "session_start");
  assert.equal(sessionStart.plugin_version, REAL_PLUGIN_VERSION);
});

test("a plugin copy with no manifest at all still writes a complete session_start line, plugin_version simply absent", () => {
  const journalScript = makePluginCopy("absent");
  const repo = makeTempRepo();

  const result = runJournal(journalScript, repo, "00000000-0000-4000-8000-0000000pv02");

  assert.equal(result.status, 0, "the hook must never fail because a version is unavailable");
  const [sessionStart] = readRunFileLines(repo);
  assert.equal(sessionStart.type, "session_start");
  assert.equal(Object.prototype.hasOwnProperty.call(sessionStart, "plugin_version"), false);
  // Every other documented key is still there - the missing version costs one field, never
  // the line, and never any of its other facts.
  for (const key of ["schema_version", "run_id", "tool", "vendor_id", "vendor_field"]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(sessionStart, key),
      `"${key}" must still be present when the manifest cannot be read`,
    );
  }
});

test("a plugin copy whose manifest is present but not valid JSON reads the same as no manifest at all", () => {
  const journalScript = makePluginCopy("corrupt");
  const repo = makeTempRepo();

  const result = runJournal(journalScript, repo, "00000000-0000-4000-8000-0000000pv03");

  assert.equal(result.status, 0);
  const [sessionStart] = readRunFileLines(repo);
  assert.equal(Object.prototype.hasOwnProperty.call(sessionStart, "plugin_version"), false);
});
