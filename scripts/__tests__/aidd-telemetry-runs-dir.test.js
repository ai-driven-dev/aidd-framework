const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which
// would point every child git call here at the real repository instead of the
// temporary one. Strip them, or "git remote add origin" edits the repo running
// the test.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);


const root = path.resolve(__dirname, "../..");

function writeTelemetryConfig(repo) {
  fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } }),
  );
}

test("AIDD_RUNS_DIR overrides where runs are written", () => {
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const script = path.join(root, "plugins/aidd-telemetry/hooks/journal.js");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-override-"));
  const runs = path.join(repo, "local-runs");
  const defaultRunsDir = path.join(repo, "aidd_docs", "runs");

  spawnSync("git", ["init", "-q", repo], { encoding: "utf8", env: CLEAN_ENV });
  fs.mkdirSync(defaultRunsDir, { recursive: true });
  writeTelemetryConfig(repo);

  spawnSync(process.execPath, [script, "session-start"], {
    input: JSON.stringify({
      session_id: "override-1",
      hook_event_name: "SessionStart",
      cwd: repo,
      transcript_path: "/home/user/.claude/projects/x/override.jsonl",
    }),
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: runs },
    encoding: "utf8",
  });

  const written = fs.readdirSync(runs, { recursive: true }).filter((f) => String(f).endsWith(".json"));
  assert.equal(written.length, 1, "the record did not land under AIDD_RUNS_DIR");

  const defaultWritten = fs.readdirSync(defaultRunsDir).filter((f) => f.endsWith(".json"));
  assert.equal(defaultWritten.length, 0, "the default aidd_docs/runs/ location was used anyway");

  fs.rmSync(repo, { recursive: true, force: true });
});

test("a user-named AIDD_RUNS_DIR keeps the permissions its owner gave it", () => {
  if (process.platform === "win32") return;
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const script = path.join(root, "plugins/aidd-telemetry/hooks/journal.js");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-mode-"));
  const runs = path.join(repo, "shared-runs");

  spawnSync("git", ["init", "-q", repo], { encoding: "utf8", env: CLEAN_ENV });
  fs.mkdirSync(path.join(repo, "aidd_docs", "runs"), { recursive: true });
  fs.mkdirSync(runs, { recursive: true, mode: 0o755 });
  fs.chmodSync(runs, 0o755);
  writeTelemetryConfig(repo);

  spawnSync(process.execPath, [script, "session-start"], {
    input: JSON.stringify({
      session_id: "mode-1",
      hook_event_name: "SessionStart",
      cwd: repo,
      transcript_path: "/home/user/.claude/projects/x/mode.jsonl",
    }),
    env: { ...CLEAN_ENV, AIDD_RUNS_DIR: runs },
    encoding: "utf8",
  });

  assert.equal(fs.readdirSync(runs).length, 1, "the record was not written");
  assert.equal(
    fs.statSync(runs).mode & 0o777,
    0o755,
    "the plugin re-permissioned a directory the user named",
  );

  fs.rmSync(repo, { recursive: true, force: true });
});

test("a task written as a single .md file attaches like a folder", () => {
  const { taskIdFromPath } = require("../../plugins/aidd-telemetry/hooks/lib/attach.js");
  const repo = "/repo";
  assert.equal(
    taskIdFromPath(repo, "/repo/aidd_docs/tasks/2026_08/2026_08_14_telemetry-v1/plan.md"),
    "2026_08_14_telemetry-v1",
  );
  assert.equal(
    taskIdFromPath(repo, "/repo/aidd_docs/tasks/2026_06/2026_06_19-rolling-weekly-releases.md"),
    "2026_06_19-rolling-weekly-releases",
  );
  assert.equal(taskIdFromPath(repo, "/repo/aidd_docs/tasks/2026_08/notes.txt"), null);
  assert.equal(taskIdFromPath(repo, "/repo/src/index.ts"), null);
  assert.equal(taskIdFromPath(repo, "/repobis/aidd_docs/tasks/2026_08/x/plan.md"), null);
});
