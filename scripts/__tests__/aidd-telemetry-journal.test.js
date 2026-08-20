const assert = require("node:assert/strict");
const { execFileSync, spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which
// would point every child git call here at the real repository instead of the
// temporary one. Strip them, or "git remote add origin" edits the repo running
// the test.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);


const {
  detectHost,
  parseOwnerRepoFromRemote,
  sanitizeProjectId,
  generateUlid,
  findRunFileByVendorId,
  looksLikeTaskPath,
  processPayload,
  resolveEventName,
  runsDir,
  telemetryEnabled,
} = require("../../plugins/aidd-telemetry/hooks/journal.js");

const { taskFolderRelativePath } = require("../../plugins/aidd-telemetry/hooks/lib/file-writes.js");

const { readSessionId, VENDOR_FIELD_BY_HOST } = require("../../plugins/aidd-telemetry/hooks/lib/record.js");

const { readCwd } = require("../../plugins/aidd-telemetry/hooks/lib/repo.js");

// One exact key set per line type (see phase-1.md) - the replacement for the
// old THE_TEN_KEYS whitelist, which guarded a single mutable record that no
// longer exists.
const SESSION_START_KEYS = [
  "type",
  "at",
  "schema_version",
  "run_id",
  "project_id",
  "project_remote",
  "tool",
  "vendor_id",
  "vendor_field",
].sort();

const TURN_END_KEYS = ["type", "at"].sort();
const TURN_END_WITH_PROMPT_KEYS = ["type", "at", "prompt_id"].sort();
const FILE_WRITTEN_KEYS = ["type", "at", "path"].sort();

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "plugins/aidd-telemetry/hooks/journal.js");
const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function loadFixture(name) {
  return JSON.parse(readFixture(name));
}

// AIDD_RUNS_DIR is pinned to an isolated, never-created temp path rather than
// inherited from the environment, since these replays exercise the write
// path and must never land in a real directory this process can reach.
function replay(input, event = "session-start") {
  return spawnSync(process.execPath, [script, event], {
    cwd: root,
    encoding: "utf8",
    input,
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: path.join(os.tmpdir(), "aidd-telemetry-unused-runs") },
  });
}

const FIXTURE_NAMES = [
  "claude-code-session-start.json",
  "codex-session-start.json",
  "copilot-session-start.json",
  "cursor-session-start.json",
  "claude-code-post-tool-use-write.json",
  "claude-code-post-tool-use-edit.json",
  "claude-code-post-tool-use-notebook-edit.json",
  "claude-code-post-tool-use-bash.json",
];

// hooks.json's own event -> argv mapping; this is what every replay below
// drives, in place of `hook_event_name`.
const ARGV_EVENT_BY_HOOK_EVENT_NAME = {
  SessionStart: "session-start",
  Stop: "turn-end",
  PostToolUse: "tool-used",
};

test("detectHost recognises the Claude Code fixture", () => {
  assert.equal(detectHost(loadFixture("claude-code-session-start.json")), "claude-code");
});

test("detectHost names each recognised host distinctly, not just null-vs-Claude-Code, since a supported-but-unwritten tool and a detection bug must stay distinguishable", () => {
  assert.equal(detectHost(loadFixture("codex-session-start.json")), "codex");
  assert.equal(detectHost(loadFixture("copilot-session-start.json")), "copilot");
  assert.equal(detectHost(loadFixture("cursor-session-start.json")), "cursor");
});

test("detectHost yields no host for an empty payload", () => {
  assert.equal(detectHost({}), null);
  assert.equal(detectHost(null), null);
  assert.equal(detectHost(undefined), null);
});

test("detectHost yields no host when transcript_path matches neither shape", () => {
  assert.equal(
    detectHost({
      session_id: "x",
      transcript_path: "/home/user/somewhere/else/notes.txt",
      hook_event_name: "SessionStart",
    }),
    null,
  );
});

test("detectHost does not misattribute Codex to Claude Code when a path matches both shapes (narrower rule wins)", () => {
  // Deliberately satisfies both patterns - a /projects/ segment (Claude
  // Code's rule) and a /sessions/<y>/<m>/<d>/rollout- segment (Codex's) -
  // so the ordering rule is actually load-bearing for this assertion.
  assert.equal(
    detectHost({
      transcript_path:
        "/home/user/projects/scratch/.codex/sessions/2026/04/24/rollout-2026-04-24T10-00-00-abc123.jsonl",
      hook_event_name: "SessionStart",
    }),
    "codex",
  );
});

// No fixture file for these: fixtures/README.md's contract is "recordings,
// not hand-written examples", and there is no Windows machine to record from.

test("detectHost recognises a Claude Code transcript_path using backslash separators", () => {
  assert.equal(
    detectHost({
      session_id: "win-cc-1",
      transcript_path: "C:\\Users\\me\\.claude\\projects\\-C-Users-me-project\\ffde6fda.jsonl",
      hook_event_name: "SessionStart",
    }),
    "claude-code",
  );
});

test("detectHost recognises a Codex transcript_path using backslash separators", () => {
  assert.equal(
    detectHost({
      session_id: "win-codex-1",
      transcript_path: "C:\\Users\\me\\.codex\\sessions\\2026\\08\\14\\rollout-2026-08-14T10-11-20-abc123.jsonl",
      hook_event_name: "SessionStart",
    }),
    "codex",
  );
});

test("detectHost applies the Codex-before-Claude-Code ordering rule to a backslash path too", () => {
  // The forward-slash equivalent of the ordering test above: both patterns
  // are satisfiable by the same path once backslashes are normalised.
  assert.equal(
    detectHost({
      transcript_path:
        "C:\\Users\\me\\projects\\scratch\\.codex\\sessions\\2026\\04\\24\\rollout-2026-04-24T10-00-00-abc123.jsonl",
      hook_event_name: "SessionStart",
    }),
    "codex",
  );
});

test("replaying the Claude Code fixture exits 0 and prints nothing", () => {
  const result = replay(readFixture("claude-code-session-start.json"));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

for (const name of ["codex-session-start.json", "copilot-session-start.json", "cursor-session-start.json"]) {
  test(`replaying the ${name} fixture exits 0 and prints nothing`, () => {
    const result = replay(readFixture(name));
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
}

for (const name of [
  "claude-code-post-tool-use-write.json",
  "claude-code-post-tool-use-edit.json",
  "claude-code-post-tool-use-notebook-edit.json",
  "claude-code-post-tool-use-bash.json",
]) {
  test(`replaying the ${name} fixture exits 0 and prints nothing`, () => {
    const result = replay(readFixture(name), "tool-used");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
}

test("replaying an empty payload exits 0", () => {
  const result = replay("");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("replaying a truncated payload exits 0", () => {
  const result = replay('{ "transcript_path": "/home/user/projects/x/y.jsonl", "hook_event');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("replaying a payload whose transcript_path matches neither shape exits 0", () => {
  const result = replay(
    JSON.stringify({
      session_id: "x",
      transcript_path: "/home/user/somewhere/else/notes.txt",
      hook_event_name: "SessionStart",
    }),
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("replaying with no stdin at all exits 0", () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    input: Buffer.alloc(0),
  });
  assert.equal(result.status, 0);
});

test("resolveEventName trusts a recognised argv word outright, even against a disagreeing hook_event_name", () => {
  assert.equal(resolveEventName("session-start", { hook_event_name: "Stop" }), "session-start");
  assert.equal(resolveEventName("turn-end", { hook_event_name: "SessionStart" }), "turn-end");
  assert.equal(resolveEventName("tool-used", {}), "tool-used");
});

test("resolveEventName falls back to hook_event_name, mapped per its own spelling, only when argv is absent or unrecognised", () => {
  assert.equal(resolveEventName(undefined, { hook_event_name: "SessionStart" }), "session-start");
  assert.equal(resolveEventName(undefined, { hook_event_name: "Stop" }), "turn-end");
  assert.equal(resolveEventName(undefined, { hook_event_name: "PostToolUse" }), "tool-used");
  assert.equal(resolveEventName(undefined, { hook_event_name: "sessionStart" }), "session-start"); // Cursor, Copilot
  assert.equal(resolveEventName(undefined, { hook_event_name: "stop" }), "turn-end"); // Cursor
  assert.equal(resolveEventName(undefined, { hook_event_name: "postToolUse" }), "tool-used"); // Cursor, Copilot
  assert.equal(resolveEventName("not-a-real-event", { hook_event_name: "Stop" }), "turn-end");
});

test("resolveEventName yields null when neither argv nor hook_event_name resolves to anything known", () => {
  assert.equal(resolveEventName(undefined, {}), null);
  assert.equal(resolveEventName(undefined, { hook_event_name: "SomethingElse" }), null);
  assert.equal(resolveEventName(undefined, null), null);
  // Cursor's own nicer afterFileEdit name is never produced for this hook -
  // the CLI's translation always emits postToolUse instead - so it must not
  // resolve to anything either.
  assert.equal(resolveEventName(undefined, { hook_event_name: "afterFileEdit" }), null);
});

for (const name of FIXTURE_NAMES.filter((n) => n.endsWith("-session-start.json"))) {
  test(`replaying ${name} with hook_event_name stripped from the payload still exits 0 - argv alone drives dispatch`, () => {
    const payload = loadFixture(name);
    delete payload.hook_event_name;
    const result = replay(JSON.stringify(payload), "session-start");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
}

for (const name of [
  "claude-code-post-tool-use-write.json",
  "claude-code-post-tool-use-edit.json",
  "claude-code-post-tool-use-notebook-edit.json",
  "claude-code-post-tool-use-bash.json",
]) {
  test(`replaying ${name} with hook_event_name stripped from the payload still exits 0 - argv alone drives dispatch`, () => {
    const payload = loadFixture(name);
    delete payload.hook_event_name;
    const result = replay(JSON.stringify(payload), "tool-used");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
}

test("a session-start replay with hook_event_name stripped still mints a record - argv alone drives dispatch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/argv-only-start.git" });
  try {
    const payload = makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000a9", event: "SessionStart" });
    delete payload.hook_event_name;
    const result = replayIn(payload, "session-start");
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 1);
  } finally {
    cleanup(repo);
  }
});

test("a turn-end replay with hook_event_name stripped still appends a turn_end line - argv alone drives dispatch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/argv-only-turn-end.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000aa";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readRunFiles(runsDirOf(repo));
    const before = readLines(written[0]);

    execFileSync("sleep", ["1.1"]);

    const payload = makePayload({ cwd: repo, sessionId, event: "Stop" });
    delete payload.hook_event_name;
    const result = replayIn(payload, "turn-end");
    assert.equal(result.status, 0);

    const after = readLines(written[0]);
    assert.equal(after.length, before.length + 1);
    assert.equal(after[after.length - 1].type, "turn_end");
  } finally {
    cleanup(repo);
  }
});

test("a file-written replay with hook_event_name stripped still appends a file_written line - argv alone drives dispatch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/argv-only-file-written.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ab";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    const payload = fileWrittenPayload({ cwd: repo, sessionId, filePath });
    delete payload.hook_event_name;
    const result = replayIn(payload, "tool-used");
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines[lines.length - 1].type, "file_written");
    assert.equal(lines[lines.length - 1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md");
  } finally {
    cleanup(repo);
  }
});

// The two hardcoded-list versions of these checks (one per redacted concern) were replaced
// by a single directory-scanning test, further down, per phase-1.md task 3.3: "run it over
// every fixture in the directory... which were never checked" - a hardcoded FIXTURE_NAMES
// array is exactly the thing a fixture added later would silently escape.

test("the Cursor fixture's user_email is the redaction placeholder", () => {
  const cursor = loadFixture("cursor-session-start.json");
  assert.equal(cursor.user_email, "user@example.com");
});

test("the Cursor post-tool-use fixture's user_email is the redaction placeholder too - the field the earlier check never reached", () => {
  const cursor = loadFixture("cursor-post-tool-use.json");
  assert.equal(cursor.user_email, "user@example.com");
});

test("parseOwnerRepoFromRemote reads owner/repo out of an SSH remote", () => {
  assert.equal(parseOwnerRepoFromRemote("git@github.com:ai-driven-dev/framework.git"), "ai-driven-dev/framework");
});

test("parseOwnerRepoFromRemote reads owner/repo out of an HTTPS remote", () => {
  assert.equal(parseOwnerRepoFromRemote("https://github.com/ai-driven-dev/framework.git"), "ai-driven-dev/framework");
});

test("parseOwnerRepoFromRemote handles a remote with no .git suffix", () => {
  assert.equal(parseOwnerRepoFromRemote("https://github.com/ai-driven-dev/framework"), "ai-driven-dev/framework");
});

test("parseOwnerRepoFromRemote collapses a subgroup path to its last two segments", () => {
  assert.equal(parseOwnerRepoFromRemote("https://gitlab.com/group/subgroup/repo.git"), "subgroup/repo");
});

test("parseOwnerRepoFromRemote yields null for a remote it cannot parse", () => {
  assert.equal(parseOwnerRepoFromRemote("not a remote"), null);
  assert.equal(parseOwnerRepoFromRemote(""), null);
  assert.equal(parseOwnerRepoFromRemote(null), null);
  assert.equal(parseOwnerRepoFromRemote(undefined), null);
});

test("sanitizeProjectId keeps a clean owner/repo untouched", () => {
  assert.equal(sanitizeProjectId("ai-driven-dev/framework"), "ai-driven-dev/framework");
});

test("sanitizeProjectId neutralises unsafe characters per segment", () => {
  assert.equal(sanitizeProjectId("weird name/../repo"), "weird-name/-/repo");
});

test("generateUlid produces a 26-character Crockford base32 string", () => {
  const id = generateUlid();
  assert.equal(id.length, 26);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/u);
});

test("generateUlid mints a different id on each call", () => {
  assert.notEqual(generateUlid(), generateUlid());
});

// Restores AIDD_RUNS_DIR to exactly what it was before, including truly
// absent rather than the string "undefined".
function withRunsDirEnv({ set = {}, unset = [] }, fn) {
  const keys = ["AIDD_RUNS_DIR"];
  const original = {};
  for (const key of keys) original[key] = process.env[key];
  try {
    for (const key of unset) delete process.env[key];
    for (const [key, value] of Object.entries(set)) process.env[key] = value;
    return fn();
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("runsDir defaults to <repoRoot>/aidd_docs/runs when AIDD_RUNS_DIR is unset", () => {
  withRunsDirEnv({ unset: ["AIDD_RUNS_DIR"] }, () => {
    assert.equal(runsDir("/repo"), path.join("/repo", "aidd_docs", "runs"));
  });
});

test("AIDD_RUNS_DIR overrides the in-repo default outright", () => {
  withRunsDirEnv({ set: { AIDD_RUNS_DIR: "/custom/runs" } }, () => {
    assert.equal(runsDir("/repo"), "/custom/runs");
  });
});

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// `withConfig` is independent of `withRunsDir`: the switch and the location
// it writes to no longer have to move together, which is the whole point of
// phase 1. Defaults to a switched-on repo, matching every test written
// before the config file existed.
function makeTempRepo({ remote, withRunsDir = true, withConfig = true } = {}) {
  const dir = makeTempDir("aidd-telemetry-repo-");
  execFileSync("git", ["init", "-q"], { cwd: dir, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, env: CLEAN_ENV });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, env: CLEAN_ENV });
  if (remote) {
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir, env: CLEAN_ENV });
  }
  if (withRunsDir) {
    fs.mkdirSync(path.join(dir, "aidd_docs", "runs"), { recursive: true });
  }
  if (withConfig) {
    writeTelemetryConfig(dir, { enabled: true });
  }
  return dir;
}

function writeTelemetryConfig(repo, { enabled = true, endpoint = "http://127.0.0.1:4318", raw } = {}) {
  const dir = path.join(repo, ".aidd");
  fs.mkdirSync(dir, { recursive: true });
  const content = raw !== undefined ? raw : JSON.stringify({ telemetry: { enabled, endpoint } });
  fs.writeFileSync(path.join(dir, "config.json"), content);
}

function runsDirOf(repo) {
  return path.join(repo, "aidd_docs", "runs");
}

function makePayload({ cwd, sessionId, event }) {
  return {
    session_id: sessionId,
    transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
    cwd,
    hook_event_name: event,
    source: "startup",
  };
}

// `event` defaults from the payload's own hook_event_name, and is overridable
// for tests that exercise a disagreement or an absent hook_event_name.
// AIDD_RUNS_DIR is set to "" (which runsDir treats as unset, being falsy) so
// an ambient override in this process's real environment can never leak in.
function replayIn(payload, event = ARGV_EVENT_BY_HOOK_EVENT_NAME[payload.hook_event_name]) {
  const args = event ? [script, event] : [script];
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: "" },
  });
}

// The one replay that does NOT strip GIT_*: it hands the hook the poisoned environment
// git itself exports, which is the only way to exercise the hook's own defence.
function replayInWithGitDir(payload, gitDir) {
  return spawnSync(process.execPath, [script, "session-start"], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: "", GIT_DIR: gitDir },
  });
}

// Run files are `.jsonl` - one line per observation, appended, never
// rewritten (see plan.md). Recurses because AIDD_RUNS_DIR can point anywhere.
function readRunFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readRunFiles(full));
    } else if (entry.name.endsWith(".jsonl")) {
      files.push(full);
    }
  }
  return files;
}

// One parsed object per non-empty line, in file order.
function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a session writes nothing and exits 0 when .aidd/config.json is absent, even with aidd_docs/runs/ present", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-config.git", withConfig: false });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-000000000001", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("aidd_docs/runs/ is no longer a permission: a switched-on session creates it on demand when it does not exist yet", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/dir-on-demand.git", withRunsDir: false });
  try {
    assert.equal(fs.existsSync(runsDirOf(repo)), false);
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000dm", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 1);
  } finally {
    cleanup(repo);
  }
});

test("an unparseable .aidd/config.json means off, and the hook exits 0", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/bad-config.git", withConfig: false });
  writeTelemetryConfig(repo, { raw: "{ this is not json" });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000bc", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a config.json that cannot be read at all (a directory in its place) means off, and the hook exits 0", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/unreadable-config.git", withConfig: false });
  // A directory named config.json: readFileSync throws EISDIR, deterministically,
  // standing in for any read error a real filesystem could hand back.
  fs.mkdirSync(path.join(repo, ".aidd", "config.json"), { recursive: true });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000rf", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("telemetry.enabled: false means off - nothing written", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/disabled-config.git", withConfig: false });
  writeTelemetryConfig(repo, { enabled: false });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000df", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("AIDD off but the provider exporting: the journal still writes nothing - the case the switch exists for", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/provider-exporting.git", withConfig: false });
  try {
    const result = spawnSync(
      process.execPath,
      [script, "session-start"],
      {
        cwd: root,
        encoding: "utf8",
        input: JSON.stringify(
          makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000pe", event: "SessionStart" }),
        ),
        // The provider's own export switches, on, with AIDD's own switch absent -
        // the journal must not key off any of these.
        env: {
          ...CLEAN_ENV,
          AIDD_RUNS_DIR: "",
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_METRICS_EXPORTER: "otlp",
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        },
      },
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("turning telemetry off mid-session stops the very next write, with no restart - the switch is read at the point of use, never cached", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/mid-session-off.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ms1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const before = fs.readFileSync(written[0]);

    execFileSync("sleep", ["1.1"]);

    writeTelemetryConfig(repo, { enabled: false });

    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
    assert.equal(result.status, 0);

    // Byte-identical, not merely deepEqual once parsed: no line - not even
    // a changed field on an existing one - may land once the switch is off.
    const after = fs.readFileSync(written[0]);
    assert.ok(after.equals(before), "no line may be appended once telemetry is off, with no restart needed");
  } finally {
    cleanup(repo);
  }
});

test("telemetryEnabled requires enabled strictly === true, not merely truthy", () => {
  const repo = makeTempDir("aidd-telemetry-strict-");
  try {
    writeTelemetryConfig(repo, { raw: JSON.stringify({ telemetry: { enabled: "true" } }) });
    assert.equal(telemetryEnabled(repo), false, "a string 'true' must not enable telemetry");

    writeTelemetryConfig(repo, { raw: JSON.stringify({ telemetry: { enabled: 1 } }) });
    assert.equal(telemetryEnabled(repo), false, "a truthy number must not enable telemetry");

    writeTelemetryConfig(repo, { raw: JSON.stringify({ telemetry: null }) });
    assert.equal(telemetryEnabled(repo), false, "a null telemetry key must not enable telemetry");

    writeTelemetryConfig(repo, { raw: JSON.stringify({}) });
    assert.equal(telemetryEnabled(repo), false, "a missing telemetry key must not enable telemetry");

    writeTelemetryConfig(repo, { enabled: true });
    assert.equal(telemetryEnabled(repo), true);
  } finally {
    cleanup(repo);
  }
});

test("telemetryEnabled is off for a repo root with no .aidd/config.json at all", () => {
  const dir = makeTempDir("aidd-telemetry-no-config-");
  try {
    assert.equal(telemetryEnabled(dir), false);
  } finally {
    cleanup(dir);
  }
});

test("a session writes exactly one file directly under aidd_docs/runs/ when opted in, its session_start line carrying exactly the documented keys", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/opted-in.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000002";
    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const runsPath = runsDirOf(repo);
    const written = readRunFiles(runsPath);
    assert.equal(written.length, 1);
    assert.equal(path.dirname(written[0]), runsPath);

    const lines = readLines(written[0]);
    assert.equal(lines.length, 1);
    const line = lines[0];
    assert.deepEqual(Object.keys(line).sort(), SESSION_START_KEYS);
    assert.equal(line.type, "session_start");
    assert.equal(line.schema_version, 2);
    assert.equal(line.project_id, "acme/opted-in");
    assert.equal(line.project_remote, "git@github.com:acme/opted-in.git");
    assert.equal(line.tool, "claude-code");
    assert.equal(line.vendor_id, sessionId);
    assert.equal(line.vendor_field, "session.id");
    assert.match(line.run_id, /^[0-9A-HJKMNP-TV-Z]{26}$/u);
    assert.equal(path.basename(written[0], ".jsonl"), `${line.run_id}__${sessionId}`);
    assert.match(line.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  } finally {
    cleanup(repo);
  }
});

test(
  "SessionStart creates the run directory 0700 and the record file 0600 on POSIX",
  { skip: process.platform === "win32" ? "POSIX mode bits do not apply on win32" : false },
  () => {
    // Forces umask 0 so 0700/0600 are exactly what lands, not whatever a
    // permissive machine default umask happened to allow.
    const originalUmask = process.umask(0);
    const repo = makeTempRepo({ remote: "git@github.com:acme/perms.git" });
    try {
      const sessionId = "00000000-0000-4000-8000-0000000000pm";
      const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
      assert.equal(result.status, 0);

      const written = readRunFiles(runsDirOf(repo));
      assert.equal(written.length, 1);

      const fileMode = fs.statSync(written[0]).mode & 0o777;
      assert.equal(fileMode, 0o600, `record file mode was 0${fileMode.toString(8)}, expected 0600`);

      const dirMode = fs.statSync(path.dirname(written[0])).mode & 0o777;
      assert.equal(dirMode, 0o700, `run directory mode was 0${dirMode.toString(8)}, expected 0700`);
    } finally {
      process.umask(originalUmask);
      cleanup(repo);
    }
  },
);

test("the whitelist: an eleventh key on either line type would fail this assertion", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/whitelist.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000wl01";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const lines = readLines(written[0]);
    assert.equal(lines.length, 2);
    assert.deepEqual(Object.keys(lines[0]).sort(), SESSION_START_KEYS);
    assert.deepEqual(Object.keys(lines[1]).sort(), TURN_END_KEYS);
  } finally {
    cleanup(repo);
  }
});

test("turn_end carries prompt_id when the Stop payload provides one", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/prompt-id-present.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000pi01";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const payload = makePayload({ cwd: repo, sessionId, event: "Stop" });
    payload.prompt_id = "prompt-001";
    const result = replayIn(payload);
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    const turnEnd = lines[lines.length - 1];
    assert.equal(turnEnd.type, "turn_end");
    assert.equal(turnEnd.prompt_id, "prompt-001");
    assert.deepEqual(Object.keys(turnEnd).sort(), TURN_END_WITH_PROMPT_KEYS);
  } finally {
    cleanup(repo);
  }
});

test("turn_end omits prompt_id, rather than writing null, when the payload carries none - the case every host observed today falls into", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/prompt-id-absent.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000pi02";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" })); // no prompt_id field at all

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    const turnEnd = lines[lines.length - 1];
    assert.equal(turnEnd.type, "turn_end");
    assert.equal(Object.prototype.hasOwnProperty.call(turnEnd, "prompt_id"), false);
    assert.deepEqual(Object.keys(turnEnd).sort(), TURN_END_KEYS);
  } finally {
    cleanup(repo);
  }
});

test("no written line contains ended_at, tasks, parent_run_id or task_id - the fields the event log leaves out", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-forbidden-fields.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000ff01";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 3);
    for (const line of lines) {
      for (const forbidden of ["ended_at", "tasks", "parent_run_id", "task_id"]) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(line, forbidden),
          false,
          `"${forbidden}" must never appear on a ${line.type} line`,
        );
      }
    }
  } finally {
    cleanup(repo);
  }
});

test("no written value is a token count, a cost, a model name, or a duration", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-measurement.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000nm01";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);

    const forbiddenKeys = [
      "tokens",
      "token_count",
      "input_tokens",
      "output_tokens",
      "cost",
      "cost_usd",
      "model",
      "model_name",
      "duration",
      "duration_ms",
      "elapsed",
      "elapsed_ms",
    ];
    for (const line of lines) {
      for (const key of forbiddenKeys) {
        assert.equal(Object.prototype.hasOwnProperty.call(line, key), false, `${line.type} must not carry "${key}"`);
      }
      for (const [key, value] of Object.entries(line)) {
        if (key === "schema_version") {
          assert.equal(typeof value, "number");
        } else {
          assert.equal(typeof value, "string", `"${key}" must be a string, not a measured quantity`);
        }
      }
    }
  } finally {
    cleanup(repo);
  }
});

test("ten turns in one session produce one file, not ten, and its lines record real time passing", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/ten-turns.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000003";
    const start = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(start.status, 0);

    const runsPath = runsDirOf(repo);
    const afterStart = readRunFiles(runsPath);
    assert.equal(afterStart.length, 1);
    const startLine = readLines(afterStart[0])[0];

    // nowIso() truncates to whole seconds, so a Stop replayed within the
    // same wall-clock second as SessionStart would not visibly move `at`
    // even if handleTurnEnd ran correctly. Crossing a second boundary for
    // real is what makes "time advances" a fact about handleTurnEnd, not a
    // fact about clock resolution.
    execFileSync("sleep", ["1.1"]);

    for (let i = 0; i < 9; i++) {
      const stop = replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
      assert.equal(stop.status, 0);
    }

    const written = readRunFiles(runsPath);
    assert.equal(written.length, 1, "nine Stop events must append to the one file, never mint a second");

    const lines = readLines(written[0]);
    assert.equal(lines.length, 10, "one session_start line plus nine turn_end lines");
    assert.equal(lines[0].run_id, startLine.run_id);
    const lastTurnEnd = lines[lines.length - 1];
    assert.equal(lastTurnEnd.type, "turn_end");
    assert.ok(
      new Date(lastTurnEnd.at) > new Date(startLine.at),
      `last turn_end.at (${lastTurnEnd.at}) did not advance past session_start.at (${startLine.at})`,
    );
  } finally {
    cleanup(repo);
  }
});

test("a second SessionStart for the same session does not mint a second file, or a second session_start line", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/resumed-session.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000006";
    const first = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(first.status, 0);

    const runsPath = runsDirOf(repo);
    const afterFirst = readRunFiles(runsPath);
    assert.equal(afterFirst.length, 1);
    const firstLines = readLines(afterFirst[0]);
    assert.equal(firstLines.length, 1);
    const runIdAfterFirst = firstLines[0].run_id;

    const second = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(second.status, 0);

    const afterSecond = readRunFiles(runsPath);
    assert.equal(afterSecond.length, 1);
    const secondLines = readLines(afterSecond[0]);
    assert.equal(secondLines.length, 1, "a resumed SessionStart must not append a duplicate session_start line");
    assert.equal(secondLines[0].run_id, runIdAfterFirst);
  } finally {
    cleanup(repo);
  }
});

test("a session exits 0 and writes nothing when git is unavailable", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-git.git" });
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify(
        makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-000000000007", event: "SessionStart" }),
      ),
      // Empty PATH makes spawnSync("git", ...) fail with ENOENT inside the hook.
      env: { ...CLEAN_ENV, AIDD_RUNS_DIR: "", PATH: "" },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a session exits 0 when the run directory cannot be created", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/blocked-write.git" });
  const blockerParent = makeTempDir("aidd-telemetry-blocker-");
  // A regular file where AIDD_RUNS_DIR expects a directory: mkdirSync under
  // it throws ENOTDIR, standing in for "no write permission".
  const blockerFile = path.join(blockerParent, "not-a-directory");
  fs.writeFileSync(blockerFile, "");
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify(
        makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-000000000008", event: "SessionStart" }),
      ),
      env: { ...CLEAN_ENV, AIDD_RUNS_DIR: blockerFile },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    cleanup(repo, blockerParent);
  }
});

test("a SessionStart with no session_id exits 0 and writes nothing, rather than a nine-key record", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-session-id.git" });
  try {
    const payload = {
      transcript_path: "/home/user/probe/cc-home/projects/-home-user-probe-project/no-session-id.jsonl",
      cwd: repo,
      hook_event_name: "SessionStart",
      source: "startup",
      // session_id deliberately absent
    };
    const result = replayIn(payload);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a Stop with no session_id exits 0 and writes nothing", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-session-id-stop.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f6";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const before = fs.readFileSync(written[0]);

    const payload = {
      transcript_path: "/home/user/probe/cc-home/projects/-home-user-probe-project/no-session-id.jsonl",
      cwd: repo,
      hook_event_name: "Stop",
      source: "startup",
      // session_id deliberately absent
    };
    const result = replayIn(payload);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");

    const after = readRunFiles(runsDirOf(repo));
    assert.equal(after.length, 1);
    assert.ok(fs.readFileSync(after[0]).equals(before));
  } finally {
    cleanup(repo);
  }
});

test("a Stop exits 0 and writes nothing when no file was ever minted for the session", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/stop-no-file.git" });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000f1", event: "Stop" }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a Stop still appends its line even when the run file's existing content is not valid JSON - turn-end never parses the file it appends to", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/corrupted-record.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f2";
    const start = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(start.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    // A corrupted earlier line, still newline-terminated (a truncated-last-line
    // scenario is covered separately, further down).
    fs.appendFileSync(written[0], "{ this is not valid json\n");
    const corrupted = fs.readFileSync(written[0]);

    const stop = replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
    assert.equal(stop.status, 0);
    assert.equal(stop.stderr, "");

    const after = fs.readFileSync(written[0]);
    assert.ok(
      after.subarray(0, corrupted.length).equals(corrupted),
      "the corrupted content must survive untouched - turn-end only ever appends",
    );
    assert.ok(after.length > corrupted.length, "turn-end must still append its own line after a corrupted one");
  } finally {
    cleanup(repo);
  }
});

test("a session that never produces a git commit still yields a complete session_start line", () => {
  // makeTempRepo runs `git init` and configures identity but never commits -
  // every test in this file already exercises that shape. This test states
  // the acceptance criterion explicitly rather than leaving it implicit.
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-commit.git" });
  try {
    const log = spawnSync("git", ["log"], { cwd: repo, encoding: "utf8", env: CLEAN_ENV });
    assert.notEqual(log.status, 0); // no commits exist

    const sessionId = "00000000-0000-4000-8000-0000000000f3";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const sessionStart = readLines(written[0])[0];
    assert.deepEqual(Object.keys(sessionStart).sort(), SESSION_START_KEYS);
    for (const key of SESSION_START_KEYS) {
      assert.notEqual(sessionStart[key], undefined, `"${key}" must be present even with no commit in the repo`);
    }
  } finally {
    cleanup(repo);
  }
});

// `parent_run_id is present and null` (#620) is gone: the field itself left
// the written form. Measured reason, from plan.md - a subagent shares its
// parent's session_id, and SubagentStart/SubagentStop carry an agent_id, so
// nesting is inside a run, not between runs; there is nothing left for the
// field to model.

test("vendor_field names the export-side attribute, and vendor_id is the same session.id value a live export would carry", () => {
  // vendor_id is exactly the payload's session_id, the same value Claude
  // Code's own OTEL export carries as session.id - not a hook-side derivative.
  const repo = makeTempRepo({ remote: "git@github.com:acme/vendor-field.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f5";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readRunFiles(runsDirOf(repo));
    const line = readLines(written[0])[0];
    assert.equal(line.vendor_field, "session.id");
    assert.notEqual(line.vendor_field, "session_id"); // not the hook-side field name
    assert.equal(line.vendor_id, sessionId);
  } finally {
    cleanup(repo);
  }
});

test("two repositories with different remotes each write into their own aidd_docs/runs/, keyed on the repository root rather than project_id", () => {
  const repoA = makeTempRepo({ remote: "git@github.com:acme/repo-a.git" });
  const repoB = makeTempRepo({ remote: "git@github.com:acme/repo-b.git" });
  try {
    replayIn(
      makePayload({ cwd: repoA, sessionId: "00000000-0000-4000-8000-0000000000a1", event: "SessionStart" }),
    );
    replayIn(
      makePayload({ cwd: repoB, sessionId: "00000000-0000-4000-8000-0000000000b1", event: "SessionStart" }),
    );

    assert.equal(readRunFiles(runsDirOf(repoA)).length, 1);
    assert.equal(readRunFiles(runsDirOf(repoB)).length, 1);
  } finally {
    cleanup(repoA, repoB);
  }
});

test("a repository with no remote still produces one record, project_id keyed on its basename and project_remote null - the path itself no longer depends on either", () => {
  const repo = makeTempRepo({});
  const basename = path.basename(repo);
  try {
    const sessionId = "00000000-0000-4000-8000-000000000005";
    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const line = readLines(written[0])[0];
    assert.equal(line.project_id, basename);
    assert.equal(line.project_remote, null);
  } finally {
    cleanup(repo);
  }
});

test("findRunFileByVendorId locates the file by filename alone, ignoring file contents entirely", () => {
  const dir = makeTempDir("aidd-telemetry-lookup-");
  try {
    const runIdA = generateUlid();
    const runIdB = generateUlid();
    // Deliberately invalid JSON: finding run B anyway proves the match is by
    // filename, not by content.
    fs.writeFileSync(path.join(dir, `${runIdA}__session-a.jsonl`), "not json at all {{{");
    fs.writeFileSync(path.join(dir, `${runIdB}__session-b.jsonl`), "not json at all {{{");

    assert.equal(findRunFileByVendorId(dir, "session-b"), path.join(dir, `${runIdB}__session-b.jsonl`));
    assert.equal(findRunFileByVendorId(dir, "session-missing"), null);
    assert.equal(findRunFileByVendorId(path.join(dir, "nowhere"), "session-a"), null);
  } finally {
    cleanup(dir);
  }
});

test("findRunFileByVendorId does not mistake a vendor_id containing the filename separator for a different session's file", () => {
  // A filename split on the first/last "__" would let vendor_id "b" match a
  // file actually written for vendor_id "a__b" (or vice versa).
  const dir = makeTempDir("aidd-telemetry-lookup-sep-");
  try {
    const runId = generateUlid();
    fs.writeFileSync(path.join(dir, `${runId}__a__b.jsonl`), "irrelevant");

    assert.equal(findRunFileByVendorId(dir, "b"), null);
    assert.equal(findRunFileByVendorId(dir, "a"), null);
    assert.equal(findRunFileByVendorId(dir, "a__b"), path.join(dir, `${runId}__a__b.jsonl`));
  } finally {
    cleanup(dir);
  }
});

test("findRunFileByVendorId ignores leftover pre-event-log .json files (both the bare <run_id>.json and the old <run_id>__<vendor_id>.json shapes), matching only .jsonl", () => {
  const dir = makeTempDir("aidd-telemetry-lookup-legacy-");
  try {
    const legacyBareRunId = generateUlid();
    fs.writeFileSync(path.join(dir, `${legacyBareRunId}.json`), JSON.stringify({ vendor_id: "session-legacy" }));

    const legacyTenKeyRunId = generateUlid();
    fs.writeFileSync(
      path.join(dir, `${legacyTenKeyRunId}__session-legacy.json`),
      JSON.stringify({ vendor_id: "session-legacy", schema_version: 1 }),
    );

    assert.equal(findRunFileByVendorId(dir, "session-legacy"), null);

    // A real .jsonl file for the same vendor_id, sitting alongside the two
    // legacy leftovers, is still found - the extension is what gates a
    // match, not merely the absence of a same-vendor legacy file.
    const runId = generateUlid();
    fs.writeFileSync(path.join(dir, `${runId}__session-legacy.jsonl`), '{"type":"session_start"}\n');
    assert.equal(findRunFileByVendorId(dir, "session-legacy"), path.join(dir, `${runId}__session-legacy.jsonl`));
  } finally {
    cleanup(dir);
  }
});

// Restores process.env exactly, including "unset" when a key didn't exist.
// Used below to drive processPayload in-process rather than through a child
// process, since counting git invocations needs to observe *this* process's
// PATH.
function withEnv(overrides, fn) {
  const original = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

// Counts real `git` invocations made while fn() runs, by prepending a
// logging wrapper script to PATH.
function countGitInvocations(fn) {
  const binDir = makeTempDir("aidd-telemetry-git-wrapper-");
  const logFile = path.join(binDir, "calls.log");
  fs.writeFileSync(logFile, "");
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(binDir, "git"), `#!/bin/sh\nprintf '.' >> "${logFile}"\nexec "${realGit}" "$@"\n`);
  fs.chmodSync(path.join(binDir, "git"), 0o755);

  try {
    withEnv({ PATH: `${binDir}:${process.env.PATH}` }, fn);
    return fs.readFileSync(logFile, "utf8").length;
  } finally {
    cleanup(binDir);
  }
}

test("a Stop shells out to git no more times with several hundred run files on disk than with one", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/git-count.git" });
  const sessionId = "git-count-session";
  try {
    withEnv({ AIDD_RUNS_DIR: "" }, () => {
      processPayload(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

      const dir = runsDirOf(repo);

      const callsWithOne = countGitInvocations(() => {
        processPayload(makePayload({ cwd: repo, sessionId, event: "Stop" }));
      });
      assert.ok(
        callsWithOne > 0,
        "the wrapper observed no git call - this test is not exercising the code path it claims to",
      );

      for (let i = 0; i < 300; i++) {
        const runId = generateUlid();
        fs.writeFileSync(path.join(dir, `${runId}__seed-${i}.jsonl`), "irrelevant, never read");
      }

      const callsWithMany = countGitInvocations(() => {
        processPayload(makePayload({ cwd: repo, sessionId, event: "Stop" }));
      });

      assert.equal(callsWithMany, callsWithOne);
    });
  } finally {
    cleanup(repo);
  }
});

test("file-written shells out to git zero times for a tool it does not track - the common case, since this fires on every tool call", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/file-written-reject-count.git" });
  const sessionId = "file-written-reject-session";
  try {
    withEnv({ AIDD_RUNS_DIR: "" }, () => {
      processPayload(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

      const callsForBash = countGitInvocations(() => {
        processPayload({
          session_id: sessionId,
          transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
          cwd: repo,
          hook_event_name: "PostToolUse",
          tool_name: "Bash",
          tool_input: { command: "echo hi", description: "echo" },
        });
      });
      assert.equal(callsForBash, 0, "a non-write tool_name must reject before any git shellout");

      const callsForUnrelatedWrite = countGitInvocations(() => {
        processPayload({
          session_id: sessionId,
          transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
          cwd: repo,
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          tool_input: { file_path: path.join(repo, "src", "index.js"), content: "x" },
        });
      });
      assert.equal(callsForUnrelatedWrite, 0, "a path outside any task folder must reject before any git shellout");

      const callsForAccepted = countGitInvocations(() => {
        processPayload({
          session_id: sessionId,
          transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
          cwd: repo,
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          tool_input: { file_path: writeIntoTaskFolder(repo, "2026_08_15_alpha"), content: "x" },
        });
      });
      assert.ok(callsForAccepted > 0, "an accepted write must still resolve the repo root via git");
    });
  } finally {
    cleanup(repo);
  }
});

test("turn-end's and file-written's in-process work stay under 200ms at p95 over 100 invocations each, against a directory holding several hundred run files", () => {
  const harness = path.join(__dirname, "aidd-telemetry-journal-perf-harness.js");
  // Spawned so this spawnSync can enforce a real kill on a hang: node:test's
  // own per-test timeout does not interrupt a blocking synchronous call.
  const result = spawnSync(process.execPath, [harness], {
    encoding: "utf8",
    timeout: 60_000,
    killSignal: "SIGKILL",
  });

  assert.equal(result.signal, null, `harness was killed (signal ${result.signal}) - in-process work hung`);
  assert.equal(result.status, 0, `harness exited ${result.status}: ${result.stderr}`);

  const { p95, mean, max, n, seeded, fileWrittenReject, fileWrittenAccept } = JSON.parse(result.stdout);
  assert.equal(n, 100);
  assert.equal(seeded, 300);
  assert.equal(fileWrittenReject.n, 100);
  assert.equal(fileWrittenAccept.n, 100);

  console.log(
    `journal file-written-reject latency: p95=${fileWrittenReject.p95.toFixed(3)}ms mean=${fileWrittenReject.mean.toFixed(3)}ms max=${fileWrittenReject.max.toFixed(3)}ms\n` +
      `journal file-written-accept latency: p95=${fileWrittenAccept.p95.toFixed(3)}ms mean=${fileWrittenAccept.mean.toFixed(3)}ms max=${fileWrittenAccept.max.toFixed(3)}ms\n` +
      `journal turn-end latency: p95=${p95.toFixed(3)}ms mean=${mean.toFixed(3)}ms max=${max.toFixed(3)}ms ` +
      `(${n} invocations, ${seeded} run files already on disk)`,
  );

  assert.ok(p95 < 200, `turn-end p95 was ${p95.toFixed(3)}ms, budget is 200ms`);
  assert.ok(fileWrittenReject.p95 < 200, `file-written-reject p95 was ${fileWrittenReject.p95.toFixed(3)}ms, budget is 200ms`);
  assert.ok(fileWrittenAccept.p95 < 200, `file-written-accept p95 was ${fileWrittenAccept.p95.toFixed(3)}ms, budget is 200ms`);
});

// task_id must carry a leading yyyy_mm_ prefix for the month segment to be derivable.
function makeTaskFolder(repo, taskId) {
  const month = taskId.slice(0, 7);
  const dir = path.join(repo, "aidd_docs", "tasks", month, taskId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeIntoTaskFolder(repo, taskId, filename = "notes.md") {
  const dir = makeTaskFolder(repo, taskId);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, "test\n");
  return filePath;
}

// Mirrors scripts/__tests__/fixtures/claude-code-post-tool-use-*.json.
function fileWrittenPayload({ cwd, sessionId, filePath, toolName = "Write" }) {
  return {
    session_id: sessionId,
    transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: toolName === "NotebookEdit" ? { notebook_path: filePath } : { file_path: filePath },
  };
}

test("looksLikeTaskPath is true for either task shape, false otherwise", () => {
  assert.equal(looksLikeTaskPath("/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"), true);
  assert.equal(looksLikeTaskPath("/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha.md"), true);
  assert.equal(looksLikeTaskPath("/repo/aidd_docs/tasks/2026_08/notes.txt"), false);
  assert.equal(looksLikeTaskPath("/repo/src/index.js"), false);
  assert.equal(looksLikeTaskPath(""), false);
  assert.equal(looksLikeTaskPath(undefined), false);
  assert.equal(looksLikeTaskPath(42), false);
});

test("looksLikeTaskPath recognises a Windows-shaped backslash path", () => {
  assert.equal(
    looksLikeTaskPath("C:\\repo\\aidd_docs\\tasks\\2026_08\\2026_08_15_alpha\\notes.md"),
    true,
  );
});

test("taskFolderRelativePath returns the path relative to repoRoot when it resolves inside repoRoot's task folder", () => {
  assert.equal(
    taskFolderRelativePath("/repo", "/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md",
  );
});

test("taskFolderRelativePath returns null when the path is outside repoRoot entirely", () => {
  assert.equal(taskFolderRelativePath("/repo", "/elsewhere/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"), null);
});

test("taskFolderRelativePath returns null for a sibling directory that merely shares repoRoot as a string prefix", () => {
  // repoRoot "/repo" must not match "/repoaidd_docs/..." - a bare startsWith
  // without a "/" boundary would let it, and the remainder after slicing off
  // the raw prefix would then satisfy the anchored pattern too.
  assert.equal(
    taskFolderRelativePath("/repo", "/repoaidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    null,
  );
  assert.equal(
    taskFolderRelativePath("/repo", "/repo-other/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    null,
  );
});

test("taskFolderRelativePath returns null when the path is inside the repo but names no task", () => {
  assert.equal(taskFolderRelativePath("/repo", "/repo/src/index.js"), null);
  assert.equal(taskFolderRelativePath("/repo", "/repo/aidd_docs/tasks/2026_08/notes.txt"), null);
});

test("taskFolderRelativePath reads a task written as a single .md file", () => {
  assert.equal(
    taskFolderRelativePath("/repo", "/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha.md"),
    "aidd_docs/tasks/2026_08/2026_08_15_alpha.md",
  );
});

test("taskFolderRelativePath recognises a Windows-shaped backslash path, and returns a '/'-separated result", () => {
  assert.equal(
    taskFolderRelativePath("C:\\repo", "C:\\repo\\aidd_docs\\tasks\\2026_08\\2026_08_15_alpha\\notes.md"),
    "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md",
  );
});

test("taskFolderRelativePath returns null for non-string or empty input", () => {
  assert.equal(taskFolderRelativePath("/repo", ""), null);
  assert.equal(taskFolderRelativePath("/repo", undefined), null);
  assert.equal(taskFolderRelativePath("", "/repo/aidd_docs/tasks/2026_08/alpha/x.md"), null);
  assert.equal(taskFolderRelativePath(undefined, "/repo/aidd_docs/tasks/2026_08/alpha/x.md"), null);
});

// advanceTasks (the tasks[]-interval state machine) is gone outright, along
// with every pure-unit test of it: file_written no longer computes or stores
// an interval, or a task_id - it records the path, and nothing derives from
// it in this hook. The six advanceTasks tests that stood here (open/leave-
// open/resume/close-and-open/null-switch/placeholder-replace) have no
// replacement, because there is no longer a state machine for them to prove
// correct - the assertions they made are about a shape this plan removes,
// not evidence this plan still needs in another form.

test("a session with no file-written at all produces only the session_start line, never a file_written line", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-write.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const lines = readLines(written[0]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].type, "session_start");
  } finally {
    cleanup(repo);
  }
});

test("a session whose only write lands outside any task folder appends no file_written line", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/write-outside.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readRunFiles(runsDirOf(repo));
    const before = fs.readFileSync(written[0]);

    const filePath = path.join(repo, "src", "index.js");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "x\n");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    const after = fs.readFileSync(written[0]);
    assert.ok(after.equals(before), "a write outside any task folder must append nothing at all");
  } finally {
    cleanup(repo);
  }
});

test("a session appends a file_written line naming the path its first write lands in", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/first-write.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t3";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].type, "file_written");
    assert.equal(lines[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md");
  } finally {
    cleanup(repo);
  }
});

test("a second write into the same task folder appends a second file_written line, not a merged interval", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/same-task.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t4";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    execFileSync("sleep", ["1.1"]); // cross a whole-second boundary, see the ten-turns test above

    replayIn(
      fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha", "more.md") }),
    );

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 3, "one session_start line plus two separate file_written lines");
    assert.equal(lines[1].type, "file_written");
    assert.equal(lines[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md");
    assert.equal(lines[2].type, "file_written");
    assert.equal(lines[2].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/more.md");
    assert.notEqual(lines[2].at, lines[1].at, "the second write is its own observation, not folded into the first");
  } finally {
    cleanup(repo);
  }
});

test("a session whose writes move from task A to task B produces two file_written lines, one path each, in order", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/task-switch.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t5";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    execFileSync("sleep", ["1.1"]);
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_16_beta") }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);

    assert.equal(lines.length, 3);
    assert.equal(lines[1].type, "file_written");
    assert.equal(lines[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md");
    assert.equal(lines[2].type, "file_written");
    assert.equal(lines[2].path, "aidd_docs/tasks/2026_08/2026_08_16_beta/notes.md");
  } finally {
    cleanup(repo);
  }
});

test("turn-end never appends a file_written line - a write and a turn are always separate observations", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/turn-end-tasks.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t6";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));

    const written = readRunFiles(runsDirOf(repo));
    const beforeLines = readLines(written[0]);

    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const afterLines = readLines(written[0]);
    assert.equal(afterLines.length, beforeLines.length + 1);
    assert.deepEqual(afterLines.slice(0, beforeLines.length), beforeLines, "every line already on disk is unchanged");
    assert.equal(afterLines[afterLines.length - 1].type, "turn_end");
  } finally {
    cleanup(repo);
  }
});

test("file-written's accept path appends a line with its own fresh `at` - the de-facto turn signal on a host with no turn-end event", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/file-written-ended-at.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ea1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readRunFiles(runsDirOf(repo));
    const startLine = readLines(written[0])[0];

    execFileSync("sleep", ["1.1"]);

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));

    const lines = readLines(written[0]);
    assert.equal(lines.length, 2);
    assert.notEqual(lines[1].at, startLine.at);
  } finally {
    cleanup(repo);
  }
});

test("file-written's reject path appends nothing at all - only the accept path is already paying for a write", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/file-written-reject-ended-at.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ea2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readRunFiles(runsDirOf(repo));
    const before = fs.readFileSync(written[0]);

    execFileSync("sleep", ["1.1"]);

    replayIn({
      session_id: sessionId,
      transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
      cwd: repo,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
    });

    const after = fs.readFileSync(written[0]);
    assert.ok(after.equals(before));
  } finally {
    cleanup(repo);
  }
});

test("a NotebookEdit into a task folder appends a file_written line, reading tool_input.notebook_path rather than file_path", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/notebook-edit.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000nb1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const notebookPath = writeIntoTaskFolder(repo, "2026_08_15_alpha", "scratch.ipynb");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: notebookPath, toolName: "NotebookEdit" }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines[1].type, "file_written");
    assert.equal(lines[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/scratch.ipynb");
  } finally {
    cleanup(repo);
  }
});

test("an Edit into a task folder appends a file_written line, same as Write", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/edit-attaches.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ed1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath, toolName: "Edit" }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines[1].type, "file_written");
    assert.equal(lines[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md");
  } finally {
    cleanup(repo);
  }
});

test("a Bash call into what looks like a task path (via tool_input.command, not a write-target field) never appends a line", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/bash-not-a-write.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000bh1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const taskDir = makeTaskFolder(repo, "2026_08_15_alpha");
    const result = replayIn({
      session_id: sessionId,
      transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
      cwd: repo,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: `cat ${path.join(taskDir, "notes.md")}`, description: "read a task file" },
    });
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 1);
  } finally {
    cleanup(repo);
  }
});

test("a Bash call whose tool_input happens to carry a file_path key still never appends a line - the gate reads tool_name, not field presence", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/bash-with-file-path.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000bh3";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    const result = replayIn({
      session_id: sessionId,
      transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
      cwd: repo,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { file_path: filePath, command: "irrelevant" },
    });
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 1);
  } finally {
    cleanup(repo);
  }
});

test("replaying the recorded Bash PostToolUse fixture against a real opted-in repo never appends a line, only the whitelisted tools do", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/bash-fixture.git" });
  try {
    const fixture = loadFixture("claude-code-post-tool-use-bash.json");
    const sessionId = "00000000-0000-4000-8000-0000000000bh2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn({ ...fixture, session_id: sessionId, cwd: repo });

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 1);
  } finally {
    cleanup(repo);
  }
});

test("every file_written line carries exactly type, at, path - no fourth key", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/interval-whitelist.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t7";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_16_beta") }));

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    const fileWrittenLines = lines.filter((line) => line.type === "file_written");
    assert.equal(fileWrittenLines.length, 2);
    for (const line of fileWrittenLines) {
      assert.deepEqual(Object.keys(line).sort(), FILE_WRITTEN_KEYS);
    }
  } finally {
    cleanup(repo);
  }
});

test("appending a later line never rewrites the bytes already on disk - each prior byte is byte-identical after every subsequent append", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/append-only.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ap1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const filePath = written[0];

    const afterStart = fs.readFileSync(filePath);

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    const afterWrite = fs.readFileSync(filePath);
    assert.ok(afterWrite.length > afterStart.length);
    assert.ok(
      afterWrite.subarray(0, afterStart.length).equals(afterStart),
      "the session_start line's bytes must be unchanged after the file-written append",
    );

    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
    const afterStop = fs.readFileSync(filePath);
    assert.ok(afterStop.length > afterWrite.length);
    assert.ok(
      afterStop.subarray(0, afterWrite.length).equals(afterWrite),
      "every byte written before the turn-end append must be unchanged after it",
    );
  } finally {
    cleanup(repo);
  }
});

test("a truncated final line leaves every earlier line readable", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/truncated-last-line.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000tr1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readRunFiles(runsDirOf(repo));
    const filePath = written[0];
    const complete = fs.readFileSync(filePath);

    // Cut into the last line's own bytes, not at a "\n" boundary - the file
    // ends in "\n", so dropping a handful of trailing bytes lands mid-line.
    const truncated = complete.subarray(0, complete.length - 5);
    fs.writeFileSync(filePath, truncated);

    const rawLines = fs.readFileSync(filePath, "utf8").split("\n").filter((l) => l.length > 0);
    assert.equal(rawLines.length, 3, "two complete lines plus the truncated remnant of the third");
    for (let i = 0; i < rawLines.length - 1; i++) {
      assert.doesNotThrow(() => JSON.parse(rawLines[i]), `line ${i} must still parse after the last line was truncated`);
    }
    assert.throws(() => JSON.parse(rawLines[rawLines.length - 1]), "the truncated final line must not parse cleanly");
  } finally {
    cleanup(repo);
  }
});

test("no source file in hooks/lib/ reads a run file's contents back - record.js and file-writes.js never read a file at all", () => {
  // Scoped to record.js and file-writes.js, not repo.js: repo.js legitimately
  // reads .aidd/config.json, which is not a run file. This is the static
  // half of the hard constraint (append never reads); the dynamic half is
  // exercised above by the corrupted-content and byte-identity tests, which
  // would fail immediately if a read-modify-write crept back in.
  const recordSrc = fs.readFileSync(
    path.join(root, "plugins/aidd-telemetry/hooks/lib/record.js"),
    "utf8",
  );
  const fileWritesSrc = fs.readFileSync(
    path.join(root, "plugins/aidd-telemetry/hooks/lib/file-writes.js"),
    "utf8",
  );
  // Every way of reading a file, not just the one in use today: a regression
  // reintroducing read-modify-write through fs.readFile or a stream would
  // otherwise slip past a guard that only knows one name.
  const ANY_READ = /\b(readFileSync|readFile|createReadStream|openSync|promises\s*\.\s*readFile)\b/u;
  assert.doesNotMatch(recordSrc, ANY_READ, "record.js must never read a run file back in order to append to it");
  assert.doesNotMatch(fileWritesSrc, ANY_READ, "file-writes.js must never read a run file back in order to append to it");
});

// Runs the hook as a real, non-blocking child process so two sessions can
// genuinely overlap in wall-clock time.
function replayAsync(payload, event = ARGV_EVENT_BY_HOOK_EVENT_NAME[payload.hook_event_name]) {
  return new Promise((resolve, reject) => {
    const args = event ? [script, event] : [script];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...CLEAN_ENV, AIDD_RUNS_DIR: "" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

test("two concurrent sessions in the same checkout each record only their own writes, never the other's", async () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/concurrent.git" });
  try {
    const sessionA = "00000000-0000-4000-8000-0000000000c1";
    const sessionB = "00000000-0000-4000-8000-0000000000c2";

    const [startA, startB] = await Promise.all([
      replayAsync(makePayload({ cwd: repo, sessionId: sessionA, event: "SessionStart" })),
      replayAsync(makePayload({ cwd: repo, sessionId: sessionB, event: "SessionStart" })),
    ]);
    assert.equal(startA.code, 0);
    assert.equal(startB.code, 0);

    const runsPath = runsDirOf(repo);
    assert.equal(readRunFiles(runsPath).length, 2);

    const filePathA = writeIntoTaskFolder(repo, "2026_08_15_alpha", "a.md");
    const filePathB = writeIntoTaskFolder(repo, "2026_08_16_beta", "b.md");
    const [writeA, writeB] = await Promise.all([
      replayAsync(fileWrittenPayload({ cwd: repo, sessionId: sessionA, filePath: filePathA })),
      replayAsync(fileWrittenPayload({ cwd: repo, sessionId: sessionB, filePath: filePathB })),
    ]);
    assert.equal(writeA.code, 0);
    assert.equal(writeB.code, 0);

    const files = readRunFiles(runsPath);
    assert.equal(files.length, 2);

    const byVendorId = {};
    for (const file of files) {
      const lines = readLines(file);
      byVendorId[lines[0].vendor_id] = lines;
    }
    assert.deepEqual(Object.keys(byVendorId).sort(), [sessionA, sessionB].sort());

    const linesA = byVendorId[sessionA];
    assert.equal(linesA.length, 2);
    assert.equal(linesA[1].type, "file_written");
    assert.equal(linesA[1].path, "aidd_docs/tasks/2026_08/2026_08_15_alpha/a.md");

    const linesB = byVendorId[sessionB];
    assert.equal(linesB.length, 2);
    assert.equal(linesB[1].type, "file_written");
    assert.equal(linesB[1].path, "aidd_docs/tasks/2026_08/2026_08_16_beta/b.md");
  } finally {
    cleanup(repo);
  }
});

// Read once so every test below fails together if a line is renamed or
// reordered, rather than drifting silently apart from what is committed.
function readAiddGitignoreBlock() {
  const lines = fs.readFileSync(path.join(root, ".gitignore"), "utf8").split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === ".aidd/*");
  assert.ok(startIndex !== -1, "expected an .aidd/* line in the repository's own .gitignore");
  return lines.slice(startIndex, startIndex + 2);
}

test("the repository's own .gitignore excludes .aidd/ state but tracks .aidd/config.json, the committed telemetry switch", () => {
  assert.deepEqual(readAiddGitignoreBlock(), [".aidd/*", "!.aidd/config.json"]);
});

// Read once so every test below fails together if a line is renamed or
// reordered, rather than drifting silently apart from what is committed.
function readRunsGitignoreBlock() {
  const lines = fs.readFileSync(path.join(root, ".gitignore"), "utf8").split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === "aidd_docs/runs/*");
  assert.ok(startIndex !== -1, "expected an aidd_docs/runs/* line in the repository's own .gitignore");
  return lines.slice(startIndex, startIndex + 3);
}

test("the repository's own .gitignore carries the documented three-line aidd_docs/runs/ block", () => {
  assert.deepEqual(readRunsGitignoreBlock(), [
    "aidd_docs/runs/*",
    "!aidd_docs/runs/.gitkeep",
    "!aidd_docs/runs/README.md",
  ]);
});

test("in a real temporary git repo: the marker files are tracked, a record file is not, and `git add -A` sweeps nothing in", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/runs-gitignore.git", withRunsDir: false });
  try {
    const rules = readRunsGitignoreBlock();
    fs.writeFileSync(path.join(repo, ".gitignore"), `${rules.join("\n")}\n`);

    const runsPath = runsDirOf(repo);
    fs.mkdirSync(runsPath, { recursive: true });
    fs.writeFileSync(path.join(runsPath, ".gitkeep"), "");
    fs.writeFileSync(path.join(runsPath, "README.md"), "marker\n");

    execFileSync("git", ["add", "-A"], { cwd: repo, env: CLEAN_ENV });
    execFileSync("git", ["commit", "-q", "-m", "opt into the run journal"], { cwd: repo, env: CLEAN_ENV });

    const tracked = execFileSync("git", ["ls-files", "aidd_docs/runs"], { cwd: repo, encoding: "utf8", env: CLEAN_ENV })
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(tracked, ["aidd_docs/runs/.gitkeep", "aidd_docs/runs/README.md"]);

    const sessionId = "00000000-0000-4000-8000-0000000000g1";
    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const recordFiles = fs.readdirSync(runsPath).filter((f) => f.endsWith(".jsonl"));
    assert.equal(recordFiles.length, 1, "the record did not land in aidd_docs/runs/");
    const recordPath = path.join(runsPath, recordFiles[0]);
    assert.ok(fs.existsSync(recordPath), "the record must be present on disk");

    const checkIgnore = spawnSync("git", ["check-ignore", "-q", recordPath], { cwd: repo, env: CLEAN_ENV });
    assert.equal(checkIgnore.status, 0, "the record file must be recognised as git-ignored");

    execFileSync("git", ["add", "-A"], { cwd: repo, env: CLEAN_ENV });
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8", env: CLEAN_ENV });
    assert.equal(status, "", "git add -A followed by status --porcelain must leave a clean tree");

    assert.ok(fs.existsSync(recordPath), "the record must remain on disk after git add -A");
  } finally {
    cleanup(repo);
  }
});

test("a repository whose .gitignore excludes .aidd/* (config.json excepted) and aidd_docs/runs/* stays clean after a session writes into an already-tracked task file", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/gitignore-aidd.git" });
  // Reuses the exact rules from this repository's own .gitignore, so the
  // integration proof and the documented rules cannot silently drift apart.
  const aiddRules = readAiddGitignoreBlock();
  const runsRules = readRunsGitignoreBlock();

  fs.writeFileSync(path.join(repo, ".gitignore"), `${aiddRules.join("\n")}\n${runsRules.join("\n")}\n`);
  const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
  execFileSync("git", ["add", "-A"], { cwd: repo, env: CLEAN_ENV });
  execFileSync("git", ["commit", "-q", "-m", "add gitignore and task file"], { cwd: repo, env: CLEAN_ENV });

  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t8";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const status = execFileSync("git", ["status", "--short"], { cwd: repo, encoding: "utf8", env: CLEAN_ENV });
    assert.equal(status, "");
  } finally {
    cleanup(repo);
  }
});

test("a credential in the remote never reaches the journal", () => {
  const repo = makeTempRepo({ remote: "https://x-access-token:ghp_SECRET123@github.com/acme/private.git" });
  try {
    replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-0000000000cr", event: "SessionStart" }),
    );
    const files = readRunFiles(runsDirOf(repo));
    assert.equal(files.length, 1);
    const raw = fs.readFileSync(files[0], "utf8");
    assert.equal(raw.includes("ghp_SECRET123"), false, "the token must not appear anywhere in the file");
    assert.equal(raw.includes("x-access-token"), false);

    const line = JSON.parse(raw.split("\n")[0]);
    assert.equal(line.project_remote, "https://github.com/acme/private.git");
    assert.equal(line.project_id, "acme/private");
  } finally {
    cleanup(repo);
  }
});

test("remoteWithoutCredentials strips userinfo from a scheme URL and leaves scp-style whole", () => {
  const { remoteWithoutCredentials } = require("../../plugins/aidd-telemetry/hooks/lib/repo.js");
  assert.equal(
    remoteWithoutCredentials("https://user:pass@github.com/o/r.git"),
    "https://github.com/o/r.git",
  );
  assert.equal(
    remoteWithoutCredentials("https://ghp_x@github.com/o/r.git"),
    "https://github.com/o/r.git",
  );
  assert.equal(remoteWithoutCredentials("https://github.com/o/r.git"), "https://github.com/o/r.git");
  assert.equal(remoteWithoutCredentials("git@github.com:o/r.git"), "git@github.com:o/r.git");
  assert.equal(remoteWithoutCredentials(null), null);
});

test("a leaked GIT_DIR never redirects a session into another repository", () => {
  const here = makeTempRepo({ remote: "git@github.com:acme/here.git" });
  const elsewhere = makeTempRepo({ remote: "git@github.com:acme/elsewhere.git" });
  try {
    const result = replayInWithGitDir(
      makePayload({ cwd: here, sessionId: "00000000-0000-4000-8000-0000000000gd", event: "SessionStart" }),
      path.join(elsewhere, ".git"),
    );

    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(elsewhere)).length, 0);

    const written = readRunFiles(runsDirOf(here));
    assert.equal(written.length, 1);
    assert.equal(readLines(written[0])[0].project_id, "acme/here");
  } finally {
    cleanup(here);
    cleanup(elsewhere);
  }
});

// ---------------------------------------------------------------------------
// Phase 1: the journal serves four hosts (see phase-1.md). Each host's own
// SessionStart shape, mirroring scripts/__tests__/fixtures/*-session-start.json -
// same field names, synthetic ids so each test owns its own session.

function makeCodexPayload({ cwd, sessionId, event, turnId }) {
  return {
    session_id: sessionId,
    turn_id: turnId,
    transcript_path: `/home/user/probe/codex-home/sessions/2026/08/14/rollout-2026-08-14T10-11-20-${sessionId}.jsonl`,
    cwd,
    hook_event_name: event,
    model: "probe-stub",
    permission_mode: "bypassPermissions",
    source: "startup",
  };
}

function makeCopilotPayload({ cwd, sessionId }) {
  // Never carries hook_event_name - not observed in any capture, on any event (see
  // fixtures/README.md). The event name can only ever come from argv for this host.
  return {
    sessionId,
    timestamp: Date.now(),
    cwd,
    source: "new",
    initialPrompt: "reply with the single word ok",
  };
}

// Cursor's own captured payload (fixtures/cursor-session-start.json - the exact shape the
// probe measured, per plan.md) carries no top-level cwd at all, only workspace_roots.
// repo.js's resolveWriteTarget/resolveRunsDir read payload.cwd unconditionally, and
// repo.js is outside phase-1's architecture projection - translating workspace_roots into a
// usable cwd is not this phase's work to invent. So this builder mirrors the real shape
// exactly; it must NOT grow a cwd field just to make a happy-path test pass, or the test
// would assert a capability the code does not have.
function makeCursorPayload({ cwd, sessionId, event }) {
  return {
    conversation_id: sessionId,
    generation_id: sessionId,
    model: "default",
    is_background_agent: false,
    session_id: sessionId,
    hook_event_name: event,
    cursor_version: "2026.08.11-e8db854",
    workspace_roots: [cwd],
    user_email: "user@example.com",
    transcript_path: null,
  };
}

test("a Codex session-start writes a session_start line naming codex, vendor_field conversation.id - measured on codex.sse_event", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/codex-start.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cdx1";
    const result = replayIn(makeCodexPayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const line = readLines(written[0])[0];
    assert.deepEqual(Object.keys(line).sort(), SESSION_START_KEYS);
    assert.equal(line.tool, "codex");
    assert.equal(line.vendor_id, sessionId);
    assert.equal(line.vendor_field, "conversation.id");
  } finally {
    cleanup(repo);
  }
});

test("a Codex turn-end (Stop) appends a turn_end line to the same file - one host table, no dispatcher change", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/codex-turn-end.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cdx2";
    replayIn(makeCodexPayload({ cwd: repo, sessionId, event: "SessionStart" }));

    execFileSync("sleep", ["1.1"]);

    const result = replayIn(makeCodexPayload({ cwd: repo, sessionId, event: "Stop", turnId: "codex-turn-1" }));
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].type, "turn_end");
  } finally {
    cleanup(repo);
  }
});

test("a Cursor session-start payload carrying no cwd still produces a run file - readCwd resolves workspace_roots (task 4), closing the gap phase 1 first shipped with", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/cursor-no-cwd.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cur1";
    const payload = makeCursorPayload({ cwd: repo, sessionId, event: "sessionStart" });
    assert.equal(payload.cwd, undefined, "this payload must carry no cwd - that is exactly the shape being proven");

    const result = replayIn(payload);
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const line = readLines(written[0])[0];
    assert.deepEqual(Object.keys(line).sort(), SESSION_START_KEYS);
    assert.equal(line.tool, "cursor");
    assert.equal(line.vendor_id, sessionId);
    assert.equal(line.vendor_field, null);
  } finally {
    cleanup(repo);
  }
});

test("a Cursor workspace whose first root is not a git repository resolves to the root that is, not index zero", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/cursor-multi-root.git" });
  const notARepo = makeTempDir("aidd-telemetry-not-a-repo-");
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cur4";
    const payload = makeCursorPayload({ cwd: repo, sessionId, event: "sessionStart" });
    payload.workspace_roots = [notARepo, repo];

    const result = replayIn(payload);
    assert.equal(result.status, 0);

    assert.equal(readRunFiles(notARepo).length, 0, "the non-repository root must never be treated as a write target");
    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1, "the second root, the one that is actually a git repository, must be the one resolved");
  } finally {
    cleanup(repo, notARepo);
  }
});

test("readCwd: every host but Cursor reads payload.cwd directly; Cursor reads the first workspace_roots entry that is a git repository", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/read-cwd-unit.git" });
  const notARepo = makeTempDir("aidd-telemetry-not-a-repo-unit-");
  try {
    assert.equal(readCwd("claude-code", { cwd: "/some/path" }), "/some/path");
    assert.equal(readCwd("codex", { cwd: "/some/path" }), "/some/path");
    assert.equal(readCwd("copilot", { cwd: "/some/path" }), "/some/path");

    assert.equal(readCwd("cursor", { workspace_roots: [notARepo, repo] }), repo);
    assert.equal(readCwd("cursor", { workspace_roots: [repo, notARepo] }), repo);
    assert.equal(readCwd("cursor", { workspace_roots: [notARepo] }), undefined);
    assert.equal(readCwd("cursor", { workspace_roots: [] }), undefined);
    assert.equal(readCwd("cursor", {}), undefined);
    assert.equal(readCwd("cursor", { cwd: repo }), undefined, "Cursor's reader must never fall back to cwd - it never carries one");
  } finally {
    cleanup(repo, notARepo);
  }
});

test("Cursor's per-host declaration is correct on its own terms: readSessionId reads session_id, and vendor_field is null because the export itself is unmeasured, not because Cursor went undetected", () => {
  assert.equal(
    readSessionId("cursor", { session_id: "cursor-declared-1" }),
    "cursor-declared-1",
  );
  assert.equal(
    VENDOR_FIELD_BY_HOST.cursor,
    null,
    "Cursor's telemetry export is unmeasured (an Enterprise team setting) - null states that fact rather than guessing a documented-but-uncaptured attribute name",
  );
});

test("Cursor's real headless end-of-session shape (sessionEnd, captured under out-cursor-skill) resolves to no canonical event at all - #680's gap, stated as a fact about resolveEventName directly", () => {
  assert.equal(
    resolveEventName(undefined, { hook_event_name: "sessionEnd" }),
    null,
    "sessionEnd is not mapped to turn-end - substituting a fabricated turn boundary is exactly what task 5 forbids",
  );
});

test("a Copilot session-start writes nothing when no event resolves - the current, real shape: no capture of any Copilot event ever carries hook_event_name, and nothing here yet supplies a decidable argv either (#681)", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/copilot-blocked.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cop1";
    // No explicit event: mirrors real Copilot traffic, where hook_event_name is absent and
    // nothing in this repository yet supplies the missing argv (see fixtures/README.md).
    const result = replayIn(makeCopilotPayload({ cwd: repo, sessionId }), undefined);
    assert.equal(result.status, 0);

    assert.equal(
      readRunFiles(runsDirOf(repo)).length,
      0,
      "Copilot is declared (see lib/record.js), but no event resolves for it today - #681 is what supplies a decidable event, not a dispatcher change",
    );
  } finally {
    cleanup(repo);
  }
});

test("a Copilot session-start, given a resolvable event, writes a session_start line carrying sessionId as vendor_id - proves the camelCase reader on its own, independent of #681's argv gap", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/copilot-camelcase.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000cop2";
    const result = replayIn(makeCopilotPayload({ cwd: repo, sessionId }), "session-start");
    assert.equal(result.status, 0);

    const written = readRunFiles(runsDirOf(repo));
    assert.equal(written.length, 1);
    const line = readLines(written[0])[0];
    assert.equal(line.tool, "copilot");
    assert.equal(line.vendor_id, sessionId, "vendor_id must be the real id, not the string \"undefined\"");
    assert.equal(line.vendor_field, "gen_ai.conversation.id");
  } finally {
    cleanup(repo);
  }
});

test("a Copilot session-start with an empty sessionId writes nothing, even given a resolvable event - the guard reads behind Copilot's own spelling too", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/copilot-empty-id.git" });
  try {
    const result = replayIn({ sessionId: "", timestamp: Date.now(), cwd: repo, source: "new" }, "session-start");
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a payload matching no declared host's shape writes nothing and exits 0, in a real switched-on repo", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/undeclared-host.git" });
  try {
    const result = replayIn(
      { session_id: "x", transcript_path: "/home/user/somewhere/else/notes.txt", cwd: repo, hook_event_name: "SessionStart" },
      "session-start",
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("replaying codex-post-tool-use.json and cursor-post-tool-use.json exits 0 and writes only what was already there - captured ahead of the phase 2 extractors that will read them", () => {
  for (const name of ["codex-post-tool-use.json", "cursor-post-tool-use.json"]) {
    const result = replay(readFixture(name), "tool-used");
    assert.equal(result.status, 0, `${name} must exit 0`);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});

test("every fixture in the directory is free of a real email address, a real home path, or a token - not just the four checked before phase 1", () => {
  const names = fs.readdirSync(fixturesDir).filter((name) => name.endsWith(".json"));
  assert.ok(names.length >= 10, "expected at least the ten fixtures phase 1 leaves behind");
  for (const name of names) {
    const raw = readFixture(name);
    assert.doesNotMatch(raw, /baptistelafourcade/iu, `${name} leaks a real username`);
    assert.doesNotMatch(raw, /\/Users\//u, `${name} leaks a real macOS home path`);
    assert.doesNotMatch(raw, /\/private\/tmp\//u, `${name} leaks an unredacted probe scratchpad path`);
    assert.doesNotMatch(raw, /@gmail\.com/iu, `${name} leaks a real email domain`);
    assert.doesNotMatch(raw, /@ecomail\.fr/iu, `${name} leaks a real email domain`);

    const emails = raw.match(/"[^"]+@[^"]+"/gu) || [];
    for (const quoted of emails) {
      assert.equal(quoted, '"user@example.com"', `${name} carries an email address other than the redaction placeholder: ${quoted}`);
    }

    const absolutePaths = raw.match(/"(\/[^"]*)"/gu) || [];
    for (const quoted of absolutePaths) {
      const value = quoted.slice(1, -1);
      assert.ok(
        value.startsWith("/home/user"),
        `${name} has an absolute path not under /home/user: ${value}`,
      );
    }
  }
});

// ── Phase 2: a started step is a fact ─────────────────────────────────────────

const {
  SKILL_FILE_PATTERN,
  STEP_START_BY_HOST,
} = require("../../plugins/aidd-telemetry/hooks/lib/step-starts.js");
const { buildStepStartLine } = require("../../plugins/aidd-telemetry/hooks/lib/record.js");

// Each entry is a real captured payload, edited only where a test needs its own repo,
// session or skill name. The shapes themselves are never hand-written: Copilot delivering
// its arguments as a JSON string and Codex naming the tool `Bash` are exactly the details
// a plausible invention would get wrong.
const STEP_FIXTURE_BY_HOST = {
  "claude-code": "claude-code-post-tool-use-skill.json",
  copilot: "copilot-post-tool-use-skill.json",
  codex: "codex-post-tool-use-skill-read.json",
  cursor: "cursor-post-tool-use-skill-read.json",
};

function stepPayload(host, { cwd, sessionId, skill }) {
  const payload = loadFixture(STEP_FIXTURE_BY_HOST[host]);
  if (host === "copilot") {
    payload.sessionId = sessionId;
    payload.cwd = cwd;
    if (skill) payload.toolArgs = JSON.stringify({ skill });
    return payload;
  }
  payload.session_id = sessionId;
  if (host === "cursor") payload.workspace_roots = [cwd];
  else payload.cwd = cwd;
  if (skill) rewriteSkillIn(payload, skill);
  return payload;
}

function rewriteSkillIn(payload, skill) {
  if (payload.tool_input.skill !== undefined) {
    payload.tool_input.skill = skill;
    return;
  }
  for (const key of Object.keys(payload.tool_input)) {
    const value = payload.tool_input[key];
    if (typeof value === "string") {
      payload.tool_input[key] = value.replace(/skills\/[^/]+\/SKILL\.md/u, `skills/${skill}/SKILL.md`);
    }
  }
}

function sessionStartPayload(host, { cwd, sessionId }) {
  const payload = loadFixture(`${host}-session-start.json`);
  if (host === "copilot") {
    payload.sessionId = sessionId;
    payload.cwd = cwd;
    return payload;
  }
  payload.session_id = sessionId;
  if (host === "cursor") payload.workspace_roots = [cwd];
  else payload.cwd = cwd;
  return payload;
}

function stepLinesIn(repo) {
  const written = readRunFiles(runsDirOf(repo));
  if (written.length === 0) return [];
  return readLines(written[0]).filter((line) => line.type === "step_start");
}

// Claude Code and Copilot name the skill in a tool argument; Codex and Cursor leave only a
// SKILL.md path. Four hosts, one assertion, because the point of the table is that the
// caller cannot tell which family ran.
for (const host of Object.keys(STEP_FIXTURE_BY_HOST)) {
  test(`a skill opened on ${host} leaves a step_start naming it, from a payload that host actually sent`, () => {
    const repo = makeTempRepo({ remote: `git@github.com:acme/step-${host}.git` });
    try {
      const sessionId = `00000000-0000-4000-8000-0000000st${host.slice(0, 3)}`;
      replayIn(sessionStartPayload(host, { cwd: repo, sessionId }), "session-start");
      const result = replayIn(stepPayload(host, { cwd: repo, sessionId }), "tool-used");
      assert.equal(result.status, 0);

      const steps = stepLinesIn(repo);
      assert.equal(steps.length, 1);
      assert.equal(steps[0].skill, "probe-echo");
    } finally {
      cleanup(repo);
    }
  });
}

test("two skills interleaved leave three ordered lines and two distinct names - the sticky attribution this whole ticket exists to replace", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-interleaved.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steA";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    for (const skill of ["alpha", "beta", "alpha"]) {
      replayIn(stepPayload("claude-code", { cwd: repo, sessionId, skill }), "tool-used");
    }

    const steps = stepLinesIn(repo);
    assert.deepEqual(
      steps.map((line) => line.skill),
      ["alpha", "beta", "alpha"]
    );
    assert.equal(new Set(steps.map((line) => line.skill)).size, 2);
  } finally {
    cleanup(repo);
  }
});

test("where the host delivers a turn identifier the step carries it, so the join to cost is exact rather than ordinal", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-turn-id.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steB";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    const payload = stepPayload("claude-code", { cwd: repo, sessionId });
    payload.prompt_id = "16231051-346b-4bfd-addc-581f911ef878";
    replayIn(payload, "tool-used");

    const [step] = stepLinesIn(repo);
    assert.equal(step.turn_id, "16231051-346b-4bfd-addc-581f911ef878");
  } finally {
    cleanup(repo);
  }
});

test("a host that carries no turn identifier omits the key rather than writing it null", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-no-turn-id.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steC";
    replayIn(sessionStartPayload("copilot", { cwd: repo, sessionId }), "session-start");
    replayIn(stepPayload("copilot", { cwd: repo, sessionId }), "tool-used");

    const [step] = stepLinesIn(repo);
    assert.equal(Object.hasOwn(step, "turn_id"), false);
  } finally {
    cleanup(repo);
  }
});

test("a step line carries no end, no duration and no parent - none of the three is anything a tool said", () => {
  const line = buildStepStartLine({ at: "2026-08-20T10:00:00Z", skill: "alpha", turnId: "t1" });
  assert.deepEqual(Object.keys(line).sort(), ["at", "skill", "turn_id", "type"]);
});

test("a skill name carrying separators or traversal cannot escape its own field", () => {
  // The separators are what make traversal traversal; the dots alone name nothing.
  assert.equal(buildStepStartLine({ at: "x", skill: "../../etc/passwd" }).skill, "..-..-etc-passwd");
  assert.equal(buildStepStartLine({ at: "x", skill: ".." }).skill, "-");
  assert.equal(buildStepStartLine({ at: "x", skill: "a/b" }).skill, "a-b");
});

test("an ordinary tool call opens no step", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-ordinary-tool.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steD";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    const filePath = writeIntoTaskFolder(repo, "2026_08_20_ordinary");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }), "tool-used");

    assert.equal(stepLinesIn(repo).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a skill call opens a step even though it has no task-folder path - the two readings of the event share nothing but the event", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-no-task-path.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steE";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    replayIn(stepPayload("claude-code", { cwd: repo, sessionId }), "tool-used");

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    assert.equal(lines.filter((line) => line.type === "step_start").length, 1);
    assert.equal(lines.filter((line) => line.type === "file_written").length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a file whose name ends in SKILL.md but sits outside a skills tree opens nothing", () => {
  assert.equal(SKILL_FILE_PATTERN.test("/repo/docs/SKILL.md"), false);
  assert.equal(SKILL_FILE_PATTERN.test("/repo/notskills/alpha/SKILL.md"), false);
  assert.equal(SKILL_FILE_PATTERN.test("/repo/.cursor/skills/alpha/SKILL.md"), true);
  assert.equal(SKILL_FILE_PATTERN.test("sed -n '1,120p' .agents/skills/alpha/SKILL.md"), true);
});

// The decisive shape is a call the argument family REJECTS that still carries a SKILL.md
// path: on an argument-family host, merely reading a skill file is not opening a step.
// A fallback chain would mint a phantom step here, and a payload the argument family
// accepts could never show it, since the first family would answer and the second never run.
test("reading a SKILL.md on an argument-family host opens no step - the table names one family, it is not a fallback chain", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-two-candidates.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steF";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");

    const payload = stepPayload("claude-code", { cwd: repo, sessionId });
    payload.tool_name = "Read";
    payload.tool_input = { file_path: `${repo}/.claude/skills/other/SKILL.md` };
    const result = replayIn(payload, "tool-used");
    assert.equal(result.status, 0);

    assert.deepEqual(stepLinesIn(repo), []);
  } finally {
    cleanup(repo);
  }
});

test("a skill argument still opens its step when the same payload also carries an unrelated SKILL.md path", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-decoy-path.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steI";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    const payload = stepPayload("claude-code", { cwd: repo, sessionId });
    payload.tool_input.decoy = "/repo/.claude/skills/other/SKILL.md";
    replayIn(payload, "tool-used");

    const steps = stepLinesIn(repo);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].skill, "probe-echo");
  } finally {
    cleanup(repo);
  }
});

test("a step for a session that was never journaled writes nothing and exits 0", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-no-run-file.git" });
  try {
    const result = replayIn(
      stepPayload("claude-code", { cwd: repo, sessionId: "00000000-0000-4000-8000-00000000steG" }),
      "tool-used"
    );
    assert.equal(result.status, 0);
    assert.equal(readRunFiles(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a step still open at session end reads differently from one closed by a turn boundary", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/step-open-vs-closed.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000steH";
    replayIn(sessionStartPayload("claude-code", { cwd: repo, sessionId }), "session-start");
    replayIn(stepPayload("claude-code", { cwd: repo, sessionId, skill: "closed" }), "tool-used");
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }), "turn-end");
    replayIn(stepPayload("claude-code", { cwd: repo, sessionId, skill: "open" }), "tool-used");

    const written = readRunFiles(runsDirOf(repo));
    const lines = readLines(written[0]);
    const lastStep = lines.map((line) => line.type).lastIndexOf("step_start");
    const lastTurnEnd = lines.map((line) => line.type).lastIndexOf("turn_end");
    assert.equal(lines[lastStep].skill, "open");
    assert.ok(lastStep > lastTurnEnd, "the trailing step has no turn boundary after it");
  } finally {
    cleanup(repo);
  }
});

test("adding a fifth host is a table entry, not an edit to the handler", () => {
  assert.deepEqual(Object.keys(STEP_START_BY_HOST).sort(), [
    "claude-code",
    "codex",
    "copilot",
    "cursor",
  ]);
  for (const declaration of Object.values(STEP_START_BY_HOST)) {
    assert.equal(typeof declaration.skillName, "function");
  }
});

// The word hooks.json ships and the word journal.js accepts are two halves of one
// contract, and nothing else checks they agree. The journal was already dead on every
// real installation once, for a mismatch of exactly this shape that 2250 tests missed
// because they all ran from the source tree.
test("every argv word hooks.json ships is one journal.js recognises", () => {
  const declared = JSON.parse(
    fs.readFileSync(path.join(root, "plugins/aidd-telemetry/hooks/hooks.json"), "utf8")
  );
  const words = [];
  for (const groups of Object.values(declared.hooks)) {
    for (const group of groups) {
      for (const entry of group.hooks) {
        const word = entry.command.trim().split(/\s+/u).pop();
        words.push(word);
      }
    }
  }
  assert.ok(words.length > 0, "hooks.json declares at least one command");
  for (const word of words) {
    assert.equal(
      resolveEventName(word, {}),
      word,
      `journal.js does not recognise the argv word "${word}" that hooks.json ships`
    );
  }
});
