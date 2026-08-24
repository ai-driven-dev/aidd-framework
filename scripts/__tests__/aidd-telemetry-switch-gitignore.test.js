const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { after, test } = require("node:test");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which would
// point every child git call here at the real repository instead of a temporary one.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

const SWITCH = path.resolve(
  __dirname,
  "../../plugins/aidd-telemetry/skills/00-init/scripts/telemetry-switch.cjs",
);
const RUNS_ENTRY = "aidd_docs/runs/";
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeRepo(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  spawnSync("git", ["init", "-q", dir], { env: CLEAN_ENV });
  return dir;
}

function switchTo(repo, state) {
  return spawnSync(process.execPath, [SWITCH, state], {
    cwd: repo,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
}

function gitignore(repo) {
  const gitignorePath = path.join(repo, ".gitignore");
  return fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : null;
}

test("turning measurement on adds the run journal to .gitignore, and nothing wider", () => {
  const repo = makeRepo("aidd-switch-gitignore-");
  const result = switchTo(repo, "on");

  assert.equal(result.status, 0, result.stderr);
  const content = gitignore(repo);
  assert.ok(content, ".gitignore was not created");
  assert.equal(content.trim(), RUNS_ENTRY.trim(), "must cover the journal and nothing wider");
});

test("an existing entry is left as it is, never duplicated", () => {
  const repo = makeRepo("aidd-switch-dedupe-");
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\naidd_docs/runs/\n");

  switchTo(repo, "on");

  const lines = gitignore(repo).split("\n").filter((l) => l.trim() === RUNS_ENTRY.trim());
  assert.equal(lines.length, 1, "the entry must appear exactly once");
});

test("a journal already tracked by git is named, once, and nothing is removed or rewritten", () => {
  const repo = makeRepo("aidd-switch-tracked-");
  fs.mkdirSync(path.join(repo, "aidd_docs", "runs"), { recursive: true });
  const trackedFile = path.join(repo, "aidd_docs", "runs", "old__vendor.jsonl");
  fs.writeFileSync(trackedFile, '{"type":"session_start"}\n');
  spawnSync("git", ["add", "aidd_docs/runs/old__vendor.jsonl"], { cwd: repo, env: CLEAN_ENV });
  spawnSync(
    "git",
    ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "committed by hand"],
    { cwd: repo, env: CLEAN_ENV },
  );

  const result = switchTo(repo, "on");

  assert.match(result.stdout, /Already tracked by git/u);
  assert.match(result.stdout, /aidd_docs\/runs\/old__vendor\.jsonl/u);
  assert.ok(fs.existsSync(trackedFile), "the file must not be removed");
  const log = spawnSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8", env: CLEAN_ENV });
  assert.equal(log.stdout.trim().split("\n").length, 1, "history must not be rewritten");
});

test("nothing extra is said when no journal file is tracked", () => {
  const repo = makeRepo("aidd-switch-clean-");
  const result = switchTo(repo, "on");

  assert.doesNotMatch(result.stdout, /Already tracked by git/u);
});

test("turning measurement off touches neither .gitignore nor the tracked-file notice", () => {
  const repo = makeRepo("aidd-switch-off-");
  fs.mkdirSync(path.join(repo, "aidd_docs", "runs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "aidd_docs", "runs", "old__vendor.jsonl"), "{}\n");
  spawnSync("git", ["add", "aidd_docs/runs/old__vendor.jsonl"], { cwd: repo, env: CLEAN_ENV });
  spawnSync(
    "git",
    ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "committed"],
    { cwd: repo, env: CLEAN_ENV },
  );

  const result = switchTo(repo, "off");

  assert.equal(gitignore(repo), null, ".gitignore must not be created by `off`");
  assert.doesNotMatch(result.stdout, /Already tracked by git/u);
});

test("a project outside any git repository still turns on, quietly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-switch-no-repo-"));
  tempDirs.push(dir);

  const result = switchTo(dir, "on");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(gitignore(dir).trim(), RUNS_ENTRY.trim());
});
