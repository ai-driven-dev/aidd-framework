/**
 * Builds a synthetic telemetry sink at the scale #694 asks about: a year of day
 * files holding a hundred journalled sessions, then reports what it wrote.
 *
 * Every identifier is generated. Nothing is copied from a real store: this runs
 * against a sandbox directory, never `~/.config/aidd/telemetry`.
 */
import { mkdirSync, rmSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const SESSIONS = Number(process.argv[3] ?? 100);
const DAYS = Number(process.argv[4] ?? 365);
const REQUESTS_PER_SESSION = Number(process.argv[5] ?? 30);

if (!dir) throw new Error("usage: build-scale-sink.mjs <dir> [sessions] [days] [requests]");

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const MODELS = ["claude-opus-5", "claude-sonnet-5", "gpt-5.4", "claude-haiku-4-5-20251001"];
const TOOLS = ["claude", "codex", "copilot", "opencode"];
const STEPS = [
  "aidd-dev:01-plan",
  "aidd-dev:02-implement",
  "aidd-dev:05-review",
  "aidd-vcs:01-commit",
  "aidd-context:10-learn",
];

/** Deterministic, so two runs measure the same sink. */
let seed = 20260903;
const next = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;

const day = (index) => {
  const d = new Date(Date.UTC(2025, 8, 4) + index * 86400000);
  return d.toISOString().slice(0, 10);
};

// The hundred sessions are spread over the year, not piled on one day: a period
// read that only ever meets one dense file measures the wrong thing.
const sessionDay = Array.from({ length: SESSIONS }, (_, s) => Math.floor((s * DAYS) / SESSIONS));

const linesByDay = new Map();
const push = (index, record) => {
  const key = day(index);
  if (!linesByDay.has(key)) linesByDay.set(key, []);
  linesByDay.get(key).push(JSON.stringify(record));
};

let records = 0;
let tokens = 0;

for (let s = 0; s < SESSIONS; s += 1) {
  const dayIndex = sessionDay[s];
  const vendorId = `0000${s}`.slice(-5).padStart(8, "s") + "-0000-4000-8000-000000000000";
  const tool = TOOLS[s % TOOLS.length];
  const project = `project-${s % 4}`;

  for (let r = 0; r < REQUESTS_PER_SESSION; r += 1) {
    const input = 200 + next(4000);
    const output = 50 + next(2000);
    const cacheRead = next(60000);
    const cacheCreation = next(9000);
    tokens += input + output + cacheRead + cacheCreation;
    records += 1;

    push(dayIndex, {
      kind: "request",
      vendor_id: vendorId,
      vendor_field: "session_id",
      turn_id: `${vendorId}-turn-${r}`,
      turn_field: "request_id",
      model: MODELS[(s + r) % MODELS.length],
      event_timestamp: `${day(dayIndex)}T${String(8 + (r % 12)).padStart(2, "0")}:00:00Z`,
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_creation_tokens: cacheCreation,
      sink_schema_version: 2,
      provenance: "local-read",
      tool,
      project_id: project,
      project_field: "repo_path_hash",
      step_attribution: r % 3 === 0 ? "unattributed" : "tool-stated",
      ...(r % 3 === 0 ? {} : { step: STEPS[(s + r) % STEPS.length] }),
    });
  }
}

// Every day of the year carries a file, empty days included: a reader that skips
// absent files is not the same code path as one that opens 365 of them.
for (let index = 0; index < DAYS; index += 1) {
  const key = day(index);
  const lines = linesByDay.get(key) ?? [];
  writeFileSync(join(dir, `${key}.jsonl`), lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
console.log(
  JSON.stringify(
    {
      dir,
      dayFiles: DAYS,
      sessions: SESSIONS,
      records,
      tokens,
      megabytes: Number((bytes / 1024 / 1024).toFixed(2)),
      firstDay: day(0),
      lastDay: day(DAYS - 1),
    },
    null,
    2
  )
);
