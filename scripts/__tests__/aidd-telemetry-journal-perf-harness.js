#!/usr/bin/env node
// aidd-telemetry-journal-perf-harness.js - measures journal.js's in-process
// turn-end and file-written latency; run as a child process of the p95 tests
// in aidd-telemetry-journal.test.js. Not itself a *.test.js file, so node
// --test does not pick it up.
//
// Spawned as a separate process so the parent test can enforce a hard
// wall-clock timeout with a real kill: node:test's own per-test timeout does
// not interrupt a blocking synchronous call (confirmed empirically - a
// `while (true) {}` test body with `{ timeout: 1000 }` does not stop at 1s).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { processPayload, generateUlid } = require("../../plugins/aidd-telemetry/hooks/journal.js");

// Under a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE, which
// would point every child git call here at the real repository instead of the
// temporary one. Strip them, or "git remote add origin" edits the repo running
// the test.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);


function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const repo = makeTempDir("aidd-telemetry-perf-repo-");
execFileSync("git", ["init", "-q"], { cwd: repo, env: CLEAN_ENV });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, env: CLEAN_ENV });
execFileSync("git", ["config", "user.name", "Test"], { cwd: repo, env: CLEAN_ENV });
execFileSync("git", ["remote", "add", "origin", "git@github.com:acme/perf.git"], { cwd: repo, env: CLEAN_ENV });

const dir = path.join(repo, "aidd_docs", "runs");
fs.mkdirSync(dir, { recursive: true });

fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
fs.writeFileSync(
  path.join(repo, ".aidd", "config.json"),
  JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } }),
);

const sessionId = "perf-target-session";
function payload(event) {
  return {
    session_id: sessionId,
    transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
    cwd: repo,
    hook_event_name: event,
    source: "startup",
  };
}

function fileWrittenPayload(toolName, filePath) {
  return {
    session_id: sessionId,
    transcript_path: `/home/user/probe/cc-home/projects/-home-user-probe-project/${sessionId}.jsonl`,
    cwd: repo,
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: toolName === "Bash" ? { command: "echo hi" } : { file_path: filePath },
  };
}

processPayload(payload("SessionStart"));

// Several hundred *other* sessions' files already in the directory, with
// deliberately unparseable content: the lookup must never read it.
const SEED_COUNT = 300;
for (let i = 0; i < SEED_COUNT; i++) {
  const runId = generateUlid();
  fs.writeFileSync(path.join(dir, `${runId}__seed-session-${i}.json`), "not real json, never read {{{");
}

function measure(label, count, fn) {
  const durationsMs = [];
  for (let i = 0; i < count; i++) {
    const startedAt = process.hrtime.bigint();
    fn(i);
    const elapsedNs = process.hrtime.bigint() - startedAt;
    durationsMs.push(Number(elapsedNs) / 1e6);
  }
  durationsMs.sort((a, b) => a - b);
  const p95Index = Math.ceil(durationsMs.length * 0.95) - 1;
  return {
    label,
    n: durationsMs.length,
    p95: durationsMs[p95Index],
    max: durationsMs[durationsMs.length - 1],
    mean: durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length,
  };
}

const INVOCATIONS = 100;

const turnEnd = measure("turn-end", INVOCATIONS, () => processPayload(payload("Stop")));

// The reject path: a Bash call, never even reaching a git shellout - the
// case that matters most, since file-written fires on every tool call.
const fileWrittenReject = measure("file-written-reject", INVOCATIONS, () =>
  processPayload(fileWrittenPayload("Bash")),
);

// The accept path: a real Write into a real task folder, one per
// invocation so each hits the disk for real rather than measuring a cache.
const taskDir = path.join(repo, "aidd_docs", "tasks", "2026_08", "2026_08_18_perf-task");
fs.mkdirSync(taskDir, { recursive: true });
let acceptCounter = 0;
const fileWrittenAccept = measure("file-written-accept", INVOCATIONS, () => {
  const filePath = path.join(taskDir, `note-${acceptCounter++}.md`);
  fs.writeFileSync(filePath, "x");
  processPayload(fileWrittenPayload("Write", filePath));
});

const result = {
  seeded: SEED_COUNT,
  n: turnEnd.n,
  p95: turnEnd.p95,
  mean: turnEnd.mean,
  max: turnEnd.max,
  fileWrittenReject,
  fileWrittenAccept,
};

fs.rmSync(repo, { recursive: true, force: true });

process.stdout.write(JSON.stringify(result));
