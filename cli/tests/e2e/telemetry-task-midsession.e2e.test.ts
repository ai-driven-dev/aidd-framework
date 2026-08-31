import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * The ordinary state of a session still running - not a crash - and the fault it used to
 * cause: `task-attribution.ts` used to close an unclosed declared interval at its own start,
 * `[t, t)`, whenever nothing had yet named a `turn_end`. A declaration is exactly that kind
 * of unclosed interval for as long as the session it belongs to keeps working, so every
 * record after it was silently lost from `by_task` until this session's own journal
 * happened to record a `turn_end` or another declaration.
 *
 * `RUN_ID`/`ALPHA_VENDOR_ID` never end their journal with a `turn_end`: the session this
 * file's happy path reads from is still running when the report is asked for, exactly the
 * state that used to lose every record after `TASK_DECLARED_AT`.
 */
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const ALPHA_VENDOR_ID = "33333333-3333-4333-8333-333333333333";
const SILENT_RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
const SILENT_VENDOR_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "acme/widgets";
const ALPHA_TASK = "2026_02/2026_02_10_alpha";
const PERIOD = ["--from", "2026-02-01", "--to", "2026-02-28"];

const SESSION_START_AT = "2026-02-10T09:00:00Z";
const TASK_DECLARED_AT = "2026-02-10T09:10:00Z";
// The journal's only witness that the session kept going after the declaration - a written
// file, no `turn_end` anywhere in this session's journal.
const FILE_WRITTEN_AT = "2026-02-10T09:40:00Z";

/** No `turn_end` at all: the session this journal describes has not ended when the report
 * below reads it. */
const ALPHA_JOURNAL_LINES = [
  {
    type: "session_start",
    at: SESSION_START_AT,
    run_id: RUN_ID,
    tool: "codex",
    vendor_id: ALPHA_VENDOR_ID,
    project_id: PROJECT_ID,
  },
  {
    type: "task_declared",
    at: TASK_DECLARED_AT,
    path: `aidd_docs/tasks/${ALPHA_TASK}/spec.md`,
  },
  {
    type: "file_written",
    at: FILE_WRITTEN_AT,
    path: `aidd_docs/tasks/${ALPHA_TASK}/plan.md`,
  },
];

/** A second, wholly separate session whose journal never names a task at all - the
 * "no-declaration" reason lives here, never mixed into the session that does declare. */
const SILENT_JOURNAL_LINES = [
  {
    type: "session_start",
    at: "2026-02-10T12:00:00Z",
    run_id: SILENT_RUN_ID,
    tool: "codex",
    vendor_id: SILENT_VENDOR_ID,
    project_id: PROJECT_ID,
  },
];

function record(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "request",
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    vendor_field: "session_meta.id",
    step_attribution: "unattributed",
    project_id: PROJECT_ID,
    ...overrides,
  };
}

// Before the declaration - precedes-declaration.
const BEFORE_DECLARATION = record({
  vendor_id: ALPHA_VENDOR_ID,
  turn_id: "before",
  event_timestamp: "2026-02-10T09:05:00Z",
  cost_usd: 1,
});
// After the declaration, before the write - the record this bug used to lose. No
// `turn_end` has been written anywhere in this session's journal at this point.
const DURING_ALPHA_NO_TURN_END = record({
  vendor_id: ALPHA_VENDOR_ID,
  turn_id: "during",
  event_timestamp: "2026-02-10T09:20:00Z",
  cost_usd: 2,
});
// After the last thing the journal witnessed (the write at 09:40) - journal-silent, never
// attributed however long the silence that follows a declaration runs.
const AFTER_LAST_WITNESS = record({
  vendor_id: ALPHA_VENDOR_ID,
  turn_id: "after",
  event_timestamp: "2026-02-10T10:30:00Z",
  cost_usd: 4,
});
// A session whose journal never declared a task at all - no-declaration.
const NEVER_DECLARED = record({
  vendor_id: SILENT_VENDOR_ID,
  turn_id: "silent",
  event_timestamp: "2026-02-10T12:05:00Z",
  cost_usd: 8,
});

const RECORDS = [BEFORE_DECLARATION, DURING_ALPHA_NO_TURN_END, AFTER_LAST_WITNESS, NEVER_DECLARED];

interface TaskRow {
  readonly task?: string;
  readonly reason?: string;
  readonly totals: { readonly requests: number; readonly cost_micro_usd?: number };
}

interface Envelope {
  readonly by_task: readonly TaskRow[];
}

describe("aidd telemetry report — a task declared while the work is still going", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function seed(): Promise<{
    projectDir: string;
    fakeHome: string;
  }> {
    const env = await createTestEnv("telemetry-task-midsession");
    cleanup = env.cleanup;
    await gitInit(env.projectDir);
    await mkdir(join(env.projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(env.projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } }),
      "utf-8"
    );
    const runsDir = join(env.projectDir, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(
      join(runsDir, `${RUN_ID}__${ALPHA_VENDOR_ID}.jsonl`),
      `${ALPHA_JOURNAL_LINES.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf-8"
    );
    await writeFile(
      join(runsDir, `${SILENT_RUN_ID}__${SILENT_VENDOR_ID}.jsonl`),
      `${SILENT_JOURNAL_LINES.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf-8"
    );
    const sinkDir = join(env.fakeHome, ".config", "aidd", "telemetry");
    await mkdir(sinkDir, { recursive: true });
    await writeFile(
      join(sinkDir, "2026-02-28.jsonl"),
      `${RECORDS.map((r) => JSON.stringify(r)).join("\n")}\n`,
      "utf-8"
    );
    return env;
  }

  // Each seed record carries its own cost, so a task row is found by the one figure that
  // stays unique to the record that produced it - `requests` is 1 on every row here.
  function taskRowOfCost(envelope: Envelope, costUsd: number): TaskRow | undefined {
    return envelope.by_task.find((row) => row.totals.cost_micro_usd === costUsd * 1_000_000);
  }

  it("attributes what follows a declaration while the session is still running, and the same closing the turn afterwards does not change", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as Envelope;

    // DURING_ALPHA_NO_TURN_END: after the declaration, before the write, no turn_end
    // anywhere in this session's journal - the exact record the pre-fix `[t, t)` interval
    // used to lose.
    const alphaRow = taskRowOfCost(envelope, 2);
    expect(alphaRow?.task).toBe(ALPHA_TASK);

    // Appending a turn_end well after the write must not change what is already attributed.
    const runsDir = join(projectDir, "aidd_docs", "runs");
    const closedLines = [...ALPHA_JOURNAL_LINES, { type: "turn_end", at: "2026-02-10T09:42:00Z" }];
    await writeFile(
      join(runsDir, `${RUN_ID}__${ALPHA_VENDOR_ID}.jsonl`),
      `${closedLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf-8"
    );
    const afterClose = JSON.parse(
      (await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome)).stdout
    ) as Envelope;

    expect(taskRowOfCost(afterClose, 2)?.task).toBe(ALPHA_TASK);
  });

  it("names each of the three unattributed reasons distinctly, never collapsing two into one", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as Envelope;

    expect(taskRowOfCost(envelope, 1)?.reason).toBe("precedes-declaration");
    expect(taskRowOfCost(envelope, 4)?.reason).toBe("journal-silent");
    expect(taskRowOfCost(envelope, 8)?.reason).toBe("no-declaration");

    const reasonRows = envelope.by_task.filter((row) => row.reason !== undefined);
    expect(new Set(reasonRows.map((row) => row.reason)).size).toBe(reasonRows.length);
  });

  it("prints each reason in the text rendering too, never one label for all three", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD], projectDir, fakeHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("before the next task this session declares");
    expect(result.stdout).toContain("the journal falls silent before this record");
    expect(result.stdout).toContain("no usable task declaration in this session");
  });
});
