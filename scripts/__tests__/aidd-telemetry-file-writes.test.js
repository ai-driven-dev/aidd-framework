const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const FILE_WRITES = path.join(root, "plugins/aidd-telemetry/hooks/lib/file-writes.cjs");
const RECORD = path.join(root, "plugins/aidd-telemetry/hooks/lib/record.cjs");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which would
// point every child git call here at the real repository instead of the temporary one.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTelemetryConfig(repo) {
  fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } }),
  );
}

// One folder per task holding a handful of files each - the shape a real task tree grows
// in, and the shape that exhausts the entry budget on folder names before it reaches files
// at all if a single directory is wide enough.
function buildWideTaskTree(tasksDir, totalFiles, filesPerFolder) {
  let written = 0;
  let index = 0;
  while (written < totalFiles) {
    const folder = path.join(tasksDir, `2026_08_01_wide-task-${index++}`);
    fs.mkdirSync(folder, { recursive: true });
    for (let i = 0; i < filesPerFolder && written < totalFiles; i++) {
      fs.writeFileSync(path.join(folder, `note-${i}.md`), "x");
      written++;
    }
  }
}

test("reports itself complete, having examined every entry, when the tree fits inside the budget", () => {
  const repo = makeTempDir("aidd-walk-small-");
  buildWideTaskTree(path.join(repo, "aidd_docs", "tasks", "2026_08"), 40, 8);

  const { taskFilesModifiedSince } = require(FILE_WRITES);
  const result = taskFilesModifiedSince(repo, 0);

  assert.equal(result.truncated, false);
  assert.equal(result.found.length, 40);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("reports itself truncated, and exactly how many entries it examined, when a directory is wider than the budget", () => {
  const repo = makeTempDir("aidd-walk-wide-");
  const { taskFilesModifiedSince, MAX_SCAN_ENTRIES } = require(FILE_WRITES);
  const totalFiles = MAX_SCAN_ENTRIES + 300;
  buildWideTaskTree(path.join(repo, "aidd_docs", "tasks", "2026_08"), totalFiles, 8);

  const result = taskFilesModifiedSince(repo, 0);

  assert.equal(result.truncated, true);
  assert.equal(result.scanned, MAX_SCAN_ENTRIES, "the entry that would cross the cap must not be counted");
  assert.ok(result.found.length < totalFiles, "found every file despite the cap");
  fs.rmSync(repo, { recursive: true, force: true });
});

// The discriminating case: a single wide directory, no per-task subfolders (a task written
// as one .md file, which taskOf() and TASK_SEGMENT_PATTERN both treat as a real task shape).
// A `pending`-only truncation check goes false here even though the budget ran out mid-way
// through this one directory's own listing: `pending` empties as soon as this directory is
// popped, before its entries are ever read, so a cut-short listing looks identical to a
// finished one unless the cut itself is tracked.
test("reports itself truncated even when the cap is hit inside one directory's own listing, with nothing left queued", () => {
  const repo = makeTempDir("aidd-walk-flat-");
  const { taskFilesModifiedSince, MAX_SCAN_ENTRIES } = require(FILE_WRITES);
  const tasksDir = path.join(repo, "aidd_docs", "tasks", "2026_08");
  fs.mkdirSync(tasksDir, { recursive: true });
  const totalFiles = MAX_SCAN_ENTRIES + 300;
  for (let i = 0; i < totalFiles; i++) {
    fs.writeFileSync(path.join(tasksDir, `2026_08_01_flat-task-${i}.md`), "x");
  }

  const result = taskFilesModifiedSince(repo, 0);

  assert.equal(result.truncated, true, "a listing cut off mid-read must not read as complete");
  assert.equal(result.scanned, MAX_SCAN_ENTRIES);
  assert.ok(result.found.length < totalFiles);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("tells the run file what it skipped, rather than reading as complete coverage, when the walk hits its cap", () => {
  const repo = makeTempDir("aidd-walk-cap-");
  spawnSync("git", ["init", "-q", repo], { encoding: "utf8", env: CLEAN_ENV });
  writeTelemetryConfig(repo);

  const { buildSessionStartLine, appendLine, runFileName, generateUlid } = require(RECORD);
  const { handleTaskFilesObserved, MAX_SCAN_ENTRIES } = require(FILE_WRITES);

  const runsDir = path.join(repo, "aidd_docs", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const runId = generateUlid();
  const vendorId = "wide-tree-session";
  const runFile = path.join(runsDir, runFileName(runId, vendorId));
  appendLine(
    runFile,
    buildSessionStartLine({
      at: "2026-08-01T00:00:00Z",
      runId,
      projectId: "acme/repo",
      projectRemote: null,
      host: "claude-code",
      vendorId,
    }),
  );

  buildWideTaskTree(path.join(repo, "aidd_docs", "tasks", "2026_08"), MAX_SCAN_ENTRIES + 300, 8);

  handleTaskFilesObserved({ cwd: repo }, "claude-code", vendorId);

  const lines = fs
    .readFileSync(runFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const truncation = lines.find((line) => line.type === "scan_truncated");

  assert.ok(truncation, "no line recorded that the walk gave up before finishing");
  assert.equal(truncation.cap, MAX_SCAN_ENTRIES);
  assert.equal(truncation.scanned, MAX_SCAN_ENTRIES);

  const fileWrittenCount = lines.filter((line) => line.type === "file_written").length;
  assert.ok(fileWrittenCount < MAX_SCAN_ENTRIES + 300, "found every file despite the cap");
  fs.rmSync(repo, { recursive: true, force: true });
});
