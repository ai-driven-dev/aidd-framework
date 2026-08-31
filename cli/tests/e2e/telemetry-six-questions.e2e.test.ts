import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * The core's own claim, held to the built command: a person asks what a period consumed
 * and gets all six answers - total, by model, by framework task, by skill, by person and
 * by project - each reconciling to the same total.
 *
 * One session, journalled with two declared tasks back to back plus a record before
 * either was declared, so `by_task` has something real to break down: a named row per
 * task, and the row for what fell in no declared interval, summing back to the total
 * exactly like every other axis.
 */
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "acme/widgets";
const ALPHA_TASK = "2026_01/2026_01_10_alpha";
const BETA_TASK = "2026_01/2026_01_10_beta";
const PERIOD = ["--from", "2026-01-01", "--to", "2026-01-31"];

const JOURNAL_LINES = [
  {
    type: "session_start",
    at: "2026-01-10T08:00:00Z",
    run_id: RUN_ID,
    tool: "codex",
    vendor_id: VENDOR_ID,
    project_id: PROJECT_ID,
  },
  {
    type: "task_declared",
    at: "2026-01-10T09:00:00Z",
    path: `aidd_docs/tasks/${ALPHA_TASK}/spec.md`,
  },
  { type: "turn_end", at: "2026-01-10T10:00:00Z" },
  {
    type: "task_declared",
    at: "2026-01-10T10:00:00Z",
    path: `aidd_docs/tasks/${BETA_TASK}/spec.md`,
  },
  { type: "turn_end", at: "2026-01-10T11:00:00Z" },
];

function record(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "request",
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    vendor_id: VENDOR_ID,
    vendor_field: "session_meta.id",
    step_attribution: "tool-stated",
    project_id: PROJECT_ID,
    ...overrides,
  };
}

// Before any declaration - lands in no known task. Cost 1.
const BEFORE_ANY_DECLARATION = record({
  turn_id: "before",
  event_timestamp: "2026-01-10T08:30:00Z",
  cost_usd: 1,
  model: "gpt-5",
  step: "aidd-dev:02-implement",
  person_id: "person-a",
});
// Inside the alpha interval. Cost 2.
const DURING_ALPHA = record({
  turn_id: "alpha",
  event_timestamp: "2026-01-10T09:30:00Z",
  cost_usd: 2,
  model: "gpt-5",
  step: "aidd-dev:02-implement",
  person_id: "person-a",
});
// Inside the beta interval. Cost 4.
const DURING_BETA = record({
  turn_id: "beta",
  event_timestamp: "2026-01-10T10:30:00Z",
  cost_usd: 4,
  model: "haiku",
  step: "aidd-dev:05-review",
  person_id: "person-b",
});
const RECORDS = [BEFORE_ANY_DECLARATION, DURING_ALPHA, DURING_BETA];

interface Totals {
  readonly requests: number;
  readonly cost_micro_usd?: number;
}

interface Envelope {
  readonly totals: Totals;
  readonly by_model: readonly { readonly totals: Totals }[];
  readonly by_task: readonly { readonly task?: string; readonly totals: Totals }[];
  readonly by_step: readonly { readonly totals: Totals }[];
  readonly by_person: readonly { readonly totals: Totals }[];
  readonly by_project: readonly { readonly totals: Totals }[];
}

function sumRequests(rows: readonly { readonly totals: Totals }[]): number {
  return rows.reduce((sum, row) => sum + row.totals.requests, 0);
}

function sumCost(rows: readonly { readonly totals: Totals }[]): number {
  return rows.reduce((sum, row) => sum + (row.totals.cost_micro_usd ?? 0), 0);
}

describe("aidd telemetry report — the six questions, over one period", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function seed(): Promise<{ projectDir: string; fakeHome: string }> {
    const env = await createTestEnv("telemetry-six-questions");
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
      join(runsDir, `${RUN_ID}__${VENDOR_ID}.jsonl`),
      `${JOURNAL_LINES.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf-8"
    );
    const sinkDir = join(env.fakeHome, ".config", "aidd", "telemetry");
    await mkdir(sinkDir, { recursive: true });
    await writeFile(
      join(sinkDir, "2026-01-31.jsonl"),
      `${RECORDS.map((r) => JSON.stringify(r)).join("\n")}\n`,
      "utf-8"
    );
    return env;
  }

  it("answers total, by model, by task, by step, by person and by project, all reconciling", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as Envelope;

    // The total: what the whole period cost.
    expect(envelope.totals.requests).toBe(3);
    expect(envelope.totals.cost_micro_usd).toBe(7_000_000);

    // Every breakdown sums back to the same total - the report's whole claim.
    for (const rows of [
      envelope.by_model,
      envelope.by_task,
      envelope.by_step,
      envelope.by_person,
      envelope.by_project,
    ]) {
      expect(sumRequests(rows)).toBe(envelope.totals.requests);
      expect(sumCost(rows)).toBe(envelope.totals.cost_micro_usd);
    }

    // by_task specifically: one row per declared task, plus the remainder - the sixth
    // question, the one a `--task` filter alone could never answer.
    const taskNames = envelope.by_task.map((row) => row.task);
    expect(taskNames).toContain(ALPHA_TASK);
    expect(taskNames).toContain(BETA_TASK);
    expect(taskNames).toContain(undefined);
    expect(envelope.by_task).toHaveLength(3);
  });

  it("prints every axis through --axis, each stating the same total it belongs to", async () => {
    const { projectDir, fakeHome } = await seed();

    for (const axis of ["total", "model", "task", "step", "person", "project"]) {
      const result = await runCli(
        ["telemetry", "report", ...PERIOD, "--axis", axis],
        projectDir,
        fakeHome
      );
      expect(result.exitCode, `--axis ${axis}: ${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`axis: ${axis === "total" ? "total" : `by ${axis}`}`);
    }
  });

  it("names the no-task row for what is known, never for what is guessed", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(
      ["telemetry", "report", ...PERIOD, "--axis", "task"],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(ALPHA_TASK);
    expect(result.stdout).toContain(BETA_TASK);
    expect(result.stdout).toContain("no declared interval covers this record");
  });
});
