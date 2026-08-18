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
  advanceTasks,
  taskIdFromPath,
  looksLikeTaskPath,
  processPayload,
  resolveEventName,
  runsDir,
} = require("../../plugins/aidd-telemetry/hooks/journal.js");

const INTERVAL_KEYS = ["from", "task_id", "to"];

const THE_TEN_KEYS = [
  "schema_version",
  "run_id",
  "project_id",
  "tool",
  "vendor_id",
  "vendor_field",
  "parent_run_id",
  "started_at",
  "ended_at",
  "tasks",
].sort();

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
  PostToolUse: "file-written",
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
    const result = replay(readFixture(name), "file-written");
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
  assert.equal(resolveEventName("file-written", {}), "file-written");
});

test("resolveEventName falls back to hook_event_name, mapped per its own spelling, only when argv is absent or unrecognised", () => {
  assert.equal(resolveEventName(undefined, { hook_event_name: "SessionStart" }), "session-start");
  assert.equal(resolveEventName(undefined, { hook_event_name: "Stop" }), "turn-end");
  assert.equal(resolveEventName(undefined, { hook_event_name: "PostToolUse" }), "file-written");
  assert.equal(resolveEventName(undefined, { hook_event_name: "sessionStart" }), "session-start"); // Cursor, Copilot
  assert.equal(resolveEventName(undefined, { hook_event_name: "stop" }), "turn-end"); // Cursor
  assert.equal(resolveEventName(undefined, { hook_event_name: "postToolUse" }), "file-written"); // Cursor, Copilot
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
    const result = replay(JSON.stringify(payload), "file-written");
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
    assert.equal(readJsonFilesRecursively(runsDirOf(repo)).length, 1);
  } finally {
    cleanup(repo);
  }
});

test("a turn-end replay with hook_event_name stripped still advances ended_at - argv alone drives dispatch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/argv-only-turn-end.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000aa";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readJsonFilesRecursively(runsDirOf(repo));
    const before = JSON.parse(fs.readFileSync(written[0], "utf8"));

    execFileSync("sleep", ["1.1"]);

    const payload = makePayload({ cwd: repo, sessionId, event: "Stop" });
    delete payload.hook_event_name;
    const result = replayIn(payload, "turn-end");
    assert.equal(result.status, 0);

    const after = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.notEqual(after.ended_at, before.ended_at);
  } finally {
    cleanup(repo);
  }
});

test("a file-written replay with hook_event_name stripped still attaches to the task folder - argv alone drives dispatch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/argv-only-file-written.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ab";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    const payload = fileWrittenPayload({ cwd: repo, sessionId, filePath });
    delete payload.hook_event_name;
    const result = replayIn(payload, "file-written");
    assert.equal(result.status, 0);

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, "2026_08_15_alpha");
  } finally {
    cleanup(repo);
  }
});

test("no fixture contains a real email address, a real home directory, or the developer's name", () => {
  for (const name of FIXTURE_NAMES) {
    const raw = readFixture(name);
    assert.doesNotMatch(raw, /baptistelafourcade/iu, `${name} leaks a real username`);
    assert.doesNotMatch(raw, /\/Users\//u, `${name} leaks a real macOS home path`);
    assert.doesNotMatch(raw, /@gmail\.com/iu, `${name} leaks a real email domain`);
  }
});

test("the Cursor fixture's user_email is the redaction placeholder", () => {
  const cursor = loadFixture("cursor-session-start.json");
  assert.equal(cursor.user_email, "user@example.com");
});

test("every fixture's absolute paths are redacted to the /home/user shape", () => {
  for (const name of FIXTURE_NAMES) {
    const raw = readFixture(name);
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

function makeTempRepo({ remote, withRunsDir = true } = {}) {
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
  return dir;
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

function readJsonFilesRecursively(dir) {
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
      files.push(...readJsonFilesRecursively(full));
    } else if (entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a session writes nothing and exits 0 when aidd_docs/runs is absent", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-opt-in.git", withRunsDir: false });
  try {
    const result = replayIn(
      makePayload({ cwd: repo, sessionId: "00000000-0000-4000-8000-000000000001", event: "SessionStart" }),
    );
    assert.equal(result.status, 0);
    // The gate itself must not be created as a side effect of a closed-gate run.
    assert.equal(fs.existsSync(runsDirOf(repo)), false);
  } finally {
    cleanup(repo);
  }
});

test("a session writes exactly one file directly under aidd_docs/runs/ when opted in, carrying exactly the ten documented keys", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/opted-in.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000002";
    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const runsPath = runsDirOf(repo);
    const written = readJsonFilesRecursively(runsPath);
    assert.equal(written.length, 1);
    assert.equal(path.dirname(written[0]), runsPath);

    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.deepEqual(Object.keys(record).sort(), THE_TEN_KEYS);
    assert.equal(record.schema_version, 1);
    assert.equal(record.project_id, "acme/opted-in");
    assert.equal(record.tool, "claude-code");
    assert.equal(record.vendor_id, sessionId);
    assert.equal(record.vendor_field, "session.id");
    assert.equal(record.parent_run_id, null);
    assert.deepEqual(record.tasks, [{ task_id: null, from: record.started_at, to: null }]);
    assert.match(record.run_id, /^[0-9A-HJKMNP-TV-Z]{26}$/u);
    assert.equal(path.basename(written[0], ".json"), `${record.run_id}__${sessionId}`);
    assert.match(record.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    assert.equal(record.ended_at, record.started_at);
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

      const written = readJsonFilesRecursively(runsDirOf(repo));
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

test("the whitelist: adding any eleventh key would fail this assertion", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/whitelist.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-00000000wl01";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));

    assert.deepEqual(Object.keys(record).sort(), THE_TEN_KEYS);
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

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));

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
    for (const key of forbiddenKeys) {
      assert.equal(Object.prototype.hasOwnProperty.call(record, key), false, `record must not carry "${key}"`);
    }

    for (const [key, value] of Object.entries(record)) {
      if (key === "schema_version") {
        assert.equal(typeof value, "number");
      } else if (key === "parent_run_id") {
        assert.equal(value, null);
      } else if (key === "tasks") {
        assert.ok(Array.isArray(value));
        for (const interval of value) {
          assert.deepEqual(Object.keys(interval).sort(), ["from", "task_id", "to"]);
        }
      } else {
        assert.equal(typeof value, "string", `"${key}" must be a string, not a measured quantity`);
      }
    }
  } finally {
    cleanup(repo);
  }
});

test("ten turns in one session produce one file, not ten, and ended_at strictly advances past started_at", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/ten-turns.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000003";
    const start = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(start.status, 0);

    const runsPath = runsDirOf(repo);
    const afterStart = readJsonFilesRecursively(runsPath);
    assert.equal(afterStart.length, 1);
    const initialRecord = JSON.parse(fs.readFileSync(afterStart[0], "utf8"));
    assert.equal(initialRecord.ended_at, initialRecord.started_at);

    // nowIso() truncates to whole seconds, so a Stop replayed within the
    // same wall-clock second as SessionStart would not visibly move
    // ended_at even if handleStop ran correctly. Crossing a second boundary
    // for real is what makes "ended_at advances" a fact about handleStop,
    // not a fact about clock resolution.
    execFileSync("sleep", ["1.1"]);

    for (let i = 0; i < 9; i++) {
      const stop = replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
      assert.equal(stop.status, 0);
    }

    const written = readJsonFilesRecursively(runsPath);
    assert.equal(written.length, 1);

    const finalRecord = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(finalRecord.run_id, initialRecord.run_id);
    assert.notEqual(finalRecord.ended_at, initialRecord.ended_at);
    assert.ok(
      new Date(finalRecord.ended_at) > new Date(initialRecord.started_at),
      `ended_at (${finalRecord.ended_at}) did not advance past started_at (${initialRecord.started_at})`,
    );
  } finally {
    cleanup(repo);
  }
});

test("a second SessionStart for the same session does not mint a second file", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/resumed-session.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-000000000006";
    const first = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(first.status, 0);

    const runsPath = runsDirOf(repo);
    const afterFirst = readJsonFilesRecursively(runsPath);
    assert.equal(afterFirst.length, 1);
    const runIdAfterFirst = JSON.parse(fs.readFileSync(afterFirst[0], "utf8")).run_id;

    const second = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(second.status, 0);

    const afterSecond = readJsonFilesRecursively(runsPath);
    assert.equal(afterSecond.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(afterSecond[0], "utf8")).run_id, runIdAfterFirst);
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
    assert.equal(readJsonFilesRecursively(runsDirOf(repo)).length, 0);
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
    assert.equal(readJsonFilesRecursively(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a Stop with no session_id exits 0 and writes nothing", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-session-id-stop.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f6";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    const before = JSON.parse(fs.readFileSync(written[0], "utf8"));

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

    const after = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(after.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(after[0], "utf8")), before);
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
    assert.equal(readJsonFilesRecursively(runsDirOf(repo)).length, 0);
  } finally {
    cleanup(repo);
  }
});

test("a Stop exits 0 when the matched run file holds corrupted JSON", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/corrupted-record.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f2";
    const start = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(start.status, 0);

    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    fs.writeFileSync(written[0], "{ this is not valid json");

    const stop = replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));
    assert.equal(stop.status, 0);
    assert.equal(stop.stderr, "");
  } finally {
    cleanup(repo);
  }
});

test("a session that never produces a git commit still yields a complete, ten-key record", () => {
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

    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.deepEqual(Object.keys(record).sort(), THE_TEN_KEYS);
    for (const key of THE_TEN_KEYS) {
      assert.notEqual(record[key], undefined, `"${key}" must be present even with no commit in the repo`);
    }
  } finally {
    cleanup(repo);
  }
});

test("parent_run_id is present and null - hooks cannot see query_source, so a subagent session looks identical to any other", () => {
  // A Claude Code subagent shares its parent's session_id and differs only by
  // query_source, an attribute no hook payload carries.
  const repo = makeTempRepo({ remote: "git@github.com:acme/subagent.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f4";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.ok(Object.prototype.hasOwnProperty.call(record, "parent_run_id"));
    assert.equal(record.parent_run_id, null);
  } finally {
    cleanup(repo);
  }
});

test("vendor_field names the export-side attribute, and vendor_id is the same session.id value a live export would carry", () => {
  // vendor_id is exactly the payload's session_id, the same value Claude
  // Code's own OTEL export carries as session.id - not a hook-side derivative.
  const repo = makeTempRepo({ remote: "git@github.com:acme/vendor-field.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000f5";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.vendor_field, "session.id");
    assert.notEqual(record.vendor_field, "session_id"); // not the hook-side field name
    assert.equal(record.vendor_id, sessionId);
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

    assert.equal(readJsonFilesRecursively(runsDirOf(repoA)).length, 1);
    assert.equal(readJsonFilesRecursively(runsDirOf(repoB)).length, 1);
  } finally {
    cleanup(repoA, repoB);
  }
});

test("a repository with no remote still produces one record, project_id keyed on its basename - the path itself no longer depends on it", () => {
  const repo = makeTempRepo({});
  const basename = path.basename(repo);
  try {
    const sessionId = "00000000-0000-4000-8000-000000000005";
    const result = replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    assert.equal(result.status, 0);

    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.project_id, basename);
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
    fs.writeFileSync(path.join(dir, `${runIdA}__session-a.json`), "not json at all {{{");
    fs.writeFileSync(path.join(dir, `${runIdB}__session-b.json`), "not json at all {{{");

    assert.equal(findRunFileByVendorId(dir, "session-b"), path.join(dir, `${runIdB}__session-b.json`));
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
    fs.writeFileSync(path.join(dir, `${runId}__a__b.json`), "irrelevant");

    assert.equal(findRunFileByVendorId(dir, "b"), null);
    assert.equal(findRunFileByVendorId(dir, "a"), null);
    assert.equal(findRunFileByVendorId(dir, "a__b"), path.join(dir, `${runId}__a__b.json`));
  } finally {
    cleanup(dir);
  }
});

test("findRunFileByVendorId ignores a leftover phase-3 <run_id>.json file with no embedded vendor_id", () => {
  const dir = makeTempDir("aidd-telemetry-lookup-legacy-");
  try {
    const runId = generateUlid();
    fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify({ vendor_id: "session-legacy" }));

    assert.equal(findRunFileByVendorId(dir, "session-legacy"), null);
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
        fs.writeFileSync(path.join(dir, `${runId}__seed-${i}.json`), "irrelevant, never read");
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

test("taskIdFromPath extracts the task_id when the path resolves inside repoRoot's task folder", () => {
  assert.equal(
    taskIdFromPath("/repo", "/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    "2026_08_15_alpha",
  );
});

test("taskIdFromPath returns null when the path is outside repoRoot entirely", () => {
  assert.equal(taskIdFromPath("/repo", "/elsewhere/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"), null);
});

test("taskIdFromPath returns null for a sibling directory that merely shares repoRoot as a string prefix", () => {
  // repoRoot "/repo" must not match "/repoaidd_docs/..." - a bare startsWith
  // without a "/" boundary would let it, and the remainder after slicing off
  // the raw prefix would then satisfy the anchored TASK_ID_PATTERN too.
  assert.equal(
    taskIdFromPath("/repo", "/repoaidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    null,
  );
  assert.equal(
    taskIdFromPath("/repo", "/repo-other/aidd_docs/tasks/2026_08/2026_08_15_alpha/notes.md"),
    null,
  );
});

test("taskIdFromPath returns null when the path is inside the repo but names no task", () => {
  assert.equal(taskIdFromPath("/repo", "/repo/src/index.js"), null);
  assert.equal(taskIdFromPath("/repo", "/repo/aidd_docs/tasks/2026_08/notes.txt"), null);
});

test("taskIdFromPath reads a task written as a single .md file", () => {
  assert.equal(
    taskIdFromPath("/repo", "/repo/aidd_docs/tasks/2026_08/2026_08_15_alpha.md"),
    "2026_08_15_alpha",
  );
});

test("taskIdFromPath recognises a Windows-shaped backslash path", () => {
  assert.equal(
    taskIdFromPath("C:\\repo", "C:\\repo\\aidd_docs\\tasks\\2026_08\\2026_08_15_alpha\\notes.md"),
    "2026_08_15_alpha",
  );
});

test("taskIdFromPath returns null for non-string or empty input", () => {
  assert.equal(taskIdFromPath("/repo", ""), null);
  assert.equal(taskIdFromPath("/repo", undefined), null);
  assert.equal(taskIdFromPath("", "/repo/aidd_docs/tasks/2026_08/alpha/x.md"), null);
  assert.equal(taskIdFromPath(undefined, "/repo/aidd_docs/tasks/2026_08/alpha/x.md"), null);
});

// ── advanceTasks: pure unit ──────────────────────────────────────────

test("advanceTasks opens the first interval, unclosed, when there is none yet", () => {
  const result = advanceTasks([], "2026_08_15_alpha", "T2", "T1");
  assert.deepEqual(result, [{ task_id: "2026_08_15_alpha", from: "T1", to: null }]);
});

test("advanceTasks leaves the interval open when the same task is seen again, so attachment does not end at the last write", () => {
  const before = [{ task_id: "2026_08_15_alpha", from: "T1", to: null }];
  const after = advanceTasks(before, "2026_08_15_alpha", "T2", "T0");
  assert.deepEqual(after, [{ task_id: "2026_08_15_alpha", from: "T1", to: null }]);
  assert.deepEqual(before, [{ task_id: "2026_08_15_alpha", from: "T1", to: null }]);
});

test("advanceTasks resumes a task with a new interval when the previous one was already closed", () => {
  const before = [{ task_id: "2026_08_15_alpha", from: "T1", to: "T2" }];
  const after = advanceTasks(before, "2026_08_15_alpha", "T3", "T0");
  assert.deepEqual(after, [
    { task_id: "2026_08_15_alpha", from: "T1", to: "T2" },
    { task_id: "2026_08_15_alpha", from: "T3", to: null },
  ]);
});

test("advanceTasks closes the open interval and opens a new one when the pointer has changed", () => {
  const before = [{ task_id: "2026_08_15_alpha", from: "T1", to: null }];
  const after = advanceTasks(before, "2026_08_16_beta", "T2", "T0");
  assert.deepEqual(after, [
    { task_id: "2026_08_15_alpha", from: "T1", to: "T2" },
    { task_id: "2026_08_16_beta", from: "T2", to: null },
  ]);
});

test("advanceTasks treats a switch to null the same as a switch to any other task_id (pure contract; file-written's own caller never passes null)", () => {
  const before = [{ task_id: "2026_08_15_alpha", from: "T1", to: null }];
  const after = advanceTasks(before, null, "T2", "T0");
  assert.deepEqual(after, [
    { task_id: "2026_08_15_alpha", from: "T1", to: "T2" },
    { task_id: null, from: "T2", to: null },
  ]);
});

test("advanceTasks replaces the unattached placeholder outright rather than closing an empty interval and appending - task A then task B is two intervals, not three", () => {
  const placeholder = [{ task_id: null, from: "T0", to: null }];
  const afterA = advanceTasks(placeholder, "2026_08_15_alpha", "T1", "T-1");
  assert.deepEqual(afterA, [{ task_id: "2026_08_15_alpha", from: "T0", to: null }]);

  const afterB = advanceTasks(afterA, "2026_08_16_beta", "T2", "T-1");
  assert.deepEqual(afterB, [
    { task_id: "2026_08_15_alpha", from: "T0", to: "T2" },
    { task_id: "2026_08_16_beta", from: "T2", to: null },
  ]);
  assert.equal(afterB.length, 2);
});

test("a session with no file-written at all produces a record with one interval and task_id: null, never no record", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/no-write.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    assert.equal(written.length, 1);
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.deepEqual(record.tasks, [{ task_id: null, from: record.started_at, to: null }]);
  } finally {
    cleanup(repo);
  }
});

test("a session whose only write lands outside any task folder stays task_id: null", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/write-outside.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = path.join(repo, "src", "index.js");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "x\n");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks.length, 1);
    assert.equal(record.tasks[0].task_id, null);
  } finally {
    cleanup(repo);
  }
});

test("a session attaches to the task folder its first write lands in", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/first-write.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t3";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.deepEqual(record.tasks, [{ task_id: "2026_08_15_alpha", from: record.started_at, to: null }]);
  } finally {
    cleanup(repo);
  }
});

test("a second write into the same task folder keeps one interval, still open, so attached time runs to the session's end", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/same-task.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t4";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath }));

    execFileSync("sleep", ["1.1"]); // cross a whole-second boundary, see the ended_at test above

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha", "more.md") }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks.length, 1);
    assert.equal(record.tasks[0].task_id, "2026_08_15_alpha");
    assert.equal(record.tasks[0].to, null, "a repeat write must not end the attachment");
    assert.notEqual(record.ended_at, record.tasks[0].from, "ended_at still advances");
  } finally {
    cleanup(repo);
  }
});

test("a session whose writes move from task A to task B produces two intervals, never one overwritten value", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/task-switch.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t5";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    execFileSync("sleep", ["1.1"]);
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_16_beta") }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));

    assert.equal(record.tasks.length, 2);
    assert.equal(record.tasks[0].task_id, "2026_08_15_alpha");
    assert.notEqual(record.tasks[0].to, null);
    assert.equal(record.tasks[1].task_id, "2026_08_16_beta");
    assert.equal(record.tasks[1].to, null);
    assert.equal(record.tasks[0].to, record.tasks[1].from);
  } finally {
    cleanup(repo);
  }
});

test("turn-end never touches tasks - only ended_at moves, attachment is file-written's alone", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/turn-end-tasks.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t6";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const beforeTasks = JSON.parse(fs.readFileSync(written[0], "utf8")).tasks;

    replayIn(makePayload({ cwd: repo, sessionId, event: "Stop" }));

    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.deepEqual(record.tasks, beforeTasks);
  } finally {
    cleanup(repo);
  }
});

test("file-written's accept path also advances ended_at - the de-facto turn signal on a host with no turn-end event", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/file-written-ended-at.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ea1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const before = JSON.parse(fs.readFileSync(written[0], "utf8"));

    execFileSync("sleep", ["1.1"]);

    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));

    const after = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.notEqual(after.ended_at, before.ended_at);
  } finally {
    cleanup(repo);
  }
});

test("file-written's reject path never touches ended_at - only the accept path is already paying for the record write", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/file-written-reject-ended-at.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ea2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const before = JSON.parse(fs.readFileSync(written[0], "utf8"));

    execFileSync("sleep", ["1.1"]);

    replayIn({
      session_id: sessionId,
      transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
      cwd: repo,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
    });

    const after = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(after.ended_at, before.ended_at);
  } finally {
    cleanup(repo);
  }
});

test("a NotebookEdit into a task folder attaches, reading tool_input.notebook_path rather than file_path", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/notebook-edit.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000nb1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const notebookPath = writeIntoTaskFolder(repo, "2026_08_15_alpha", "scratch.ipynb");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: notebookPath, toolName: "NotebookEdit" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, "2026_08_15_alpha");
  } finally {
    cleanup(repo);
  }
});

test("an Edit into a task folder attaches, same as Write", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/edit-attaches.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000ed1";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));

    const filePath = writeIntoTaskFolder(repo, "2026_08_15_alpha");
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath, toolName: "Edit" }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, "2026_08_15_alpha");
  } finally {
    cleanup(repo);
  }
});

test("a Bash call into what looks like a task path (via tool_input.command, not a write-target field) never attaches", () => {
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

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, null);
  } finally {
    cleanup(repo);
  }
});

test("a Bash call whose tool_input happens to carry a file_path key still never attaches - the gate reads tool_name, not field presence", () => {
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

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, null);
  } finally {
    cleanup(repo);
  }
});

test("replaying the recorded Bash PostToolUse fixture against a real opted-in repo never attaches, only the whitelisted tools do", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/bash-fixture.git" });
  try {
    const fixture = loadFixture("claude-code-post-tool-use-bash.json");
    const sessionId = "00000000-0000-4000-8000-0000000000bh2";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn({ ...fixture, session_id: sessionId, cwd: repo });

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks[0].task_id, null);
  } finally {
    cleanup(repo);
  }
});

test("every interval object carries exactly task_id, from, to - no eleventh key on a task switch", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/interval-whitelist.git" });
  try {
    const sessionId = "00000000-0000-4000-8000-0000000000t7";
    replayIn(makePayload({ cwd: repo, sessionId, event: "SessionStart" }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_15_alpha") }));
    replayIn(fileWrittenPayload({ cwd: repo, sessionId, filePath: writeIntoTaskFolder(repo, "2026_08_16_beta") }));

    const written = readJsonFilesRecursively(runsDirOf(repo));
    const record = JSON.parse(fs.readFileSync(written[0], "utf8"));
    assert.equal(record.tasks.length, 2);
    for (const interval of record.tasks) {
      assert.deepEqual(Object.keys(interval).sort(), INTERVAL_KEYS);
    }
  } finally {
    cleanup(repo);
  }
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

test("two concurrent sessions in the same checkout each attach only from their own writes, never from the other's", async () => {
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
    assert.equal(readJsonFilesRecursively(runsPath).length, 2);

    const filePathA = writeIntoTaskFolder(repo, "2026_08_15_alpha", "a.md");
    const filePathB = writeIntoTaskFolder(repo, "2026_08_16_beta", "b.md");
    const [writeA, writeB] = await Promise.all([
      replayAsync(fileWrittenPayload({ cwd: repo, sessionId: sessionA, filePath: filePathA })),
      replayAsync(fileWrittenPayload({ cwd: repo, sessionId: sessionB, filePath: filePathB })),
    ]);
    assert.equal(writeA.code, 0);
    assert.equal(writeB.code, 0);

    const files = readJsonFilesRecursively(runsPath);
    assert.equal(files.length, 2);

    const records = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    const byVendorId = Object.fromEntries(records.map((r) => [r.vendor_id, r]));
    assert.deepEqual(Object.keys(byVendorId).sort(), [sessionA, sessionB].sort());

    assert.deepEqual(byVendorId[sessionA].tasks, [
      { task_id: "2026_08_15_alpha", from: byVendorId[sessionA].started_at, to: null },
    ]);
    assert.deepEqual(byVendorId[sessionB].tasks, [
      { task_id: "2026_08_16_beta", from: byVendorId[sessionB].started_at, to: null },
    ]);
  } finally {
    cleanup(repo);
  }
});

test("the repository's own .gitignore excludes .aidd/", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /^\.aidd\/$/mu);
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

    const recordFiles = fs.readdirSync(runsPath).filter((f) => f.endsWith(".json"));
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

test("a repository whose .gitignore excludes .aidd/ and aidd_docs/runs/* stays clean after a session attaches to an already-tracked task file", () => {
  const repo = makeTempRepo({ remote: "git@github.com:acme/gitignore-aidd.git" });
  // Reuses the exact rules from this repository's own .gitignore, so the
  // integration proof and the documented rules cannot silently drift apart.
  const aiddRule = fs
    .readFileSync(path.join(root, ".gitignore"), "utf8")
    .split("\n")
    .find((line) => line.trim() === ".aidd/");
  assert.ok(aiddRule, "expected an .aidd/ line in the repository's own .gitignore");
  const runsRules = readRunsGitignoreBlock();

  fs.writeFileSync(path.join(repo, ".gitignore"), `${aiddRule}\n${runsRules.join("\n")}\n`);
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
