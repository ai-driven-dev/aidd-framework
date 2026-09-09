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
  readManifestVersion,
  versionFromAiddManifest,
  MANIFEST_DIRS,
  PLUGIN_NAME,
  AIDD_TOOL_ID_BY_HOST,
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

test("MANIFEST_DIRS names every directory the build renames this plugin's manifest into", () => {
  // Duplicated from the CLI on purpose - this plugin is copied verbatim into user projects
  // and can import nothing from `cli/` - and pinned here so the copy cannot drift. Read off
  // each profile's own declared manifest path, since no single file lists them.
  const profilesDir = path.resolve(__dirname, "../../cli/src/contexts/tools/domain/profiles");
  const declared = [];
  for (const tool of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!tool.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(profilesDir, tool.name))) {
      if (!file.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(profilesDir, tool.name, file), "utf8");
      for (const m of source.matchAll(/"(\.[A-Za-z0-9_.-]+)\/plugin\.json"/gu)) declared.push(m[1]);
    }
  }

  assert.ok(declared.length > 0, "the CLI must still declare manifest directories");
  assert.deepEqual([...MANIFEST_DIRS].sort(), [...new Set(declared)].sort());
});

test("PLUGIN_NAME is the name this plugin's own manifest states", () => {
  assert.equal(PLUGIN_NAME, JSON.parse(fs.readFileSync(REAL_MANIFEST_PATH, "utf8")).name);
});

test("AIDD_TOOL_ID_BY_HOST maps every journal host the CLI declares, onto that tool's own id", () => {
  // The journal's host names and `.aidd/manifest.json`'s tool ids are the same set spelled
  // twice; only Claude Code differs. A host missing here answers `undefined` and silently
  // costs the version, so the map has to be complete rather than merely correct.
  const profilesDir = path.resolve(__dirname, "../../cli/src/contexts/tools/domain/profiles");
  const declared = {};
  for (const tool of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!tool.isDirectory()) continue;
    const profile = path.join(profilesDir, tool.name, "profile.ts");
    if (!fs.existsSync(profile)) continue;
    const host = /telemetryJournalHost:\s*"([^"]+)"/u.exec(fs.readFileSync(profile, "utf8"));
    if (host) declared[host[1]] = tool.name;
  }

  assert.ok(Object.keys(declared).length > 0, "the CLI must still declare journal hosts");
  assert.deepEqual(Object.keys(AIDD_TOOL_ID_BY_HOST).sort(), Object.keys(declared).sort());
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

test("pluginVersion answers per repository, never handing one project's version to the next", () => {
  // No process-wide memo: the second route makes the answer depend on which repository asks,
  // so a cache keyed on nothing would hand one repository's answer to the next.
  const repoWithout = makeTempDir("aidd-plugin-version-norepo-");
  const repoWith = makeTempDir("aidd-plugin-version-withrepo-");
  fs.mkdirSync(path.join(repoWith, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(repoWith, ".aidd", "manifest.json"),
    JSON.stringify({ tools: { cursor: { plugins: [{ name: PLUGIN_NAME, version: "9.9.9" }] } } }),
  );

  assert.equal(versionFromAiddManifest(repoWith, "cursor"), "9.9.9");
  assert.equal(versionFromAiddManifest(repoWithout, "cursor"), null);
  assert.equal(versionFromAiddManifest(repoWith, "cursor"), "9.9.9");
});

test("the aidd manifest answers for the host's own tool, never for whichever lists this plugin first", () => {
  // `aidd plugin update --tool cursor` updates one tool's copy alone, so two entries can
  // legitimately disagree. Answering with the wrong one would be worse than answering with
  // nothing.
  const repo = makeTempDir("aidd-plugin-version-twotools-");
  fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".aidd", "manifest.json"),
    JSON.stringify({
      tools: {
        claude: { plugins: [{ name: PLUGIN_NAME, version: "1.0.0" }] },
        cursor: { plugins: [{ name: PLUGIN_NAME, version: "2.0.0" }] },
      },
    }),
  );

  assert.equal(versionFromAiddManifest(repo, "claude-code"), "1.0.0");
  assert.equal(versionFromAiddManifest(repo, "cursor"), "2.0.0");
  assert.equal(versionFromAiddManifest(repo, "a-host-no-tool-claims"), null);
});

// The integration half: journal.cjs run from a temporary copy of this plugin's own hooks/
// tree, so a missing manifest is exercised without touching this repository's own committed
// plugin.json - a structural concern neither the real tree nor a fixture alone can vary.
const HOOKS_SRC = path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks");
const REAL_CLAUDE_PLUGIN_DIR = path.resolve(__dirname, "../../plugins/aidd-telemetry/.claude-plugin");

/** A copy of `hooks/` plus `.claude-plugin/`, in the same relative layout a real install
 * carries them in - `hooks/lib/plugin-version.cjs`'s own `DEFAULT_MANIFEST_PATH` walks up
 * from `__dirname`, so this is what lets the copy's own manifest (present, corrupted, or
 * missing entirely, per `withManifest`) be the one it actually reads. */
function makePluginCopy(withManifest, manifestDir = ".claude-plugin") {
  const pluginRoot = makeTempDir("aidd-plugin-version-copy-");
  fs.cpSync(HOOKS_SRC, path.join(pluginRoot, "hooks"), { recursive: true });
  if (withManifest === "valid") {
    fs.cpSync(REAL_CLAUDE_PLUGIN_DIR, path.join(pluginRoot, manifestDir), { recursive: true });
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

test("finds the manifest under every name the build renames it to, not only Claude's", () => {
  // A lookup naming one manifest directory leaves every other tool writing a line with no
  // version at all, indistinguishable from one written before the field existed. Driven
  // through the real hook, one built layout at a time.
  for (const manifestDir of MANIFEST_DIRS) {
    const journalScript = makePluginCopy("valid", manifestDir);
    const repo = makeTempRepo();

    const result = runJournal(journalScript, repo, `00000000-0000-4000-8000-00000000pv${MANIFEST_DIRS.indexOf(manifestDir)}0`);

    assert.equal(result.status, 0, `${manifestDir}: ${result.stderr}`);
    const [sessionStart] = readRunFileLines(repo);
    assert.equal(sessionStart.plugin_version, REAL_PLUGIN_VERSION, `under ${manifestDir}`);
  }
});

test("falls back to what the aidd CLI recorded when the hooks were installed away from any manifest", () => {
  // `aidd setup` copies `hooks/` alone, with no manifest at any offset, and writes
  // `.aidd/manifest.json` in the same act - the only thing left that knows the version.
  const journalScript = makePluginCopy("absent");
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, ".aidd", "manifest.json"),
    JSON.stringify({
      version: 6,
      tools: { claude: { plugins: [{ name: PLUGIN_NAME, version: "3.1.4" }] } },
    }),
  );

  const result = runJournal(journalScript, repo, "00000000-0000-4000-8000-0000000pv90");

  assert.equal(result.status, 0, result.stderr);
  const [sessionStart] = readRunFileLines(repo);
  assert.equal(sessionStart.plugin_version, "3.1.4");
});

test("prefers the plugin's own manifest over what a stale aidd manifest remembers", () => {
  // The manifest beside the hooks is what this build *is*; the aidd manifest is what some
  // earlier install recorded. When both answer, the plugin's own is the one that cannot be
  // out of date with the file being run.
  const journalScript = makePluginCopy("valid");
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, ".aidd", "manifest.json"),
    JSON.stringify({
      version: 6,
      tools: { claude: { plugins: [{ name: PLUGIN_NAME, version: "0.0.1-stale" }] } },
    }),
  );

  const result = runJournal(journalScript, repo, "00000000-0000-4000-8000-0000000pv91");

  assert.equal(result.status, 0, result.stderr);
  const [sessionStart] = readRunFileLines(repo);
  assert.equal(sessionStart.plugin_version, REAL_PLUGIN_VERSION);
});
