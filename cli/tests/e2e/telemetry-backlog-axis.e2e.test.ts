import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * The upward link, end to end: a task folder's `backlog-link.json` changes what
 * `aidd telemetry report` groups by, through the real CLI binary and real disk — never the
 * in-memory doubles the domain unit tests exercise. Two properties this level alone can
 * prove: the report never writes into a task folder while reading it, and two tasks
 * declaring the same item merge into one row through the real adapter, not just the pure
 * function.
 */
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBX";
const VENDOR_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_ID = "acme/widgets";
const TASK_ITEM_A = "2026_02/2026_02_10_item-a";
const TASK_ITEM_B = "2026_02/2026_02_10_item-b";
const TASK_NONE = "2026_02/2026_02_10_none";
const BACKLOG_ITEM = "acme/widgets#661";
const PERIOD = ["--from", "2026-02-01", "--to", "2026-02-28"];

const JOURNAL_LINES = [
  {
    type: "session_start",
    at: "2026-02-10T09:00:00Z",
    run_id: RUN_ID,
    tool: "codex",
    vendor_id: VENDOR_ID,
    project_id: PROJECT_ID,
  },
  {
    type: "task_declared",
    at: "2026-02-10T09:10:00Z",
    path: `aidd_docs/tasks/${TASK_ITEM_A}/spec.md`,
  },
  {
    type: "task_declared",
    at: "2026-02-10T10:10:00Z",
    path: `aidd_docs/tasks/${TASK_ITEM_B}/spec.md`,
  },
  {
    type: "task_declared",
    at: "2026-02-10T11:10:00Z",
    path: `aidd_docs/tasks/${TASK_NONE}/spec.md`,
  },
  { type: "turn_end", at: "2026-02-10T12:00:00Z" },
];

function record(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "request",
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    vendor_id: VENDOR_ID,
    vendor_field: "session_meta.id",
    step_attribution: "unattributed",
    project_id: PROJECT_ID,
    ...overrides,
  };
}

const RECORDS = [
  record({ turn_id: "item-a", event_timestamp: "2026-02-10T09:30:00Z", cost_usd: 10 }),
  record({ turn_id: "item-b", event_timestamp: "2026-02-10T10:30:00Z", cost_usd: 5 }),
  record({ turn_id: "none", event_timestamp: "2026-02-10T11:30:00Z", cost_usd: 3 }),
];

interface BacklogRow {
  readonly backlog?: string;
  readonly declaration?: string;
  readonly reason?: string;
  readonly totals: { readonly requests: number; readonly cost_micro_usd?: number };
}

interface Envelope {
  readonly cost_report_version: number;
  readonly totals: { readonly requests: number; readonly cost_micro_usd?: number };
  readonly by_backlog: readonly BacklogRow[];
  readonly by_task: readonly { readonly totals: { readonly requests: number } }[];
}

function backlogLink(backlog: string, writtenBy: string): string {
  return `${JSON.stringify(
    { backlog, written_at: "2026-02-10T08:00:00Z", written_by: writtenBy },
    null,
    2
  )}\n`;
}

/** Every file under `dir`, hashed by its own bytes — the whole set, not only files a caller
 * already knows about, so a file the report *created* is caught exactly as one it modified
 * would be. */
async function snapshot(dir: string): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  const walk = async (current: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files.set(
          relative(dir, full),
          createHash("sha256")
            .update(await readFile(full))
            .digest("hex")
        );
      }
    }
  };
  await walk(dir);
  return files;
}

describe("aidd telemetry report — by_backlog through the real adapter, on real disk", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function seed(): Promise<{ projectDir: string; fakeHome: string }> {
    const env = await createTestEnv("telemetry-backlog-axis");
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
    // Two tasks declare the same backlog item; one declares none at all - a normal folder,
    // no backlog-link.json written into it.
    const itemATaskDir = join(env.projectDir, "aidd_docs", "tasks", TASK_ITEM_A);
    const itemBTaskDir = join(env.projectDir, "aidd_docs", "tasks", TASK_ITEM_B);
    const noneTaskDir = join(env.projectDir, "aidd_docs", "tasks", TASK_NONE);
    await mkdir(itemATaskDir, { recursive: true });
    await mkdir(itemBTaskDir, { recursive: true });
    await mkdir(noneTaskDir, { recursive: true });
    await writeFile(join(itemATaskDir, "spec.md"), "# item a\n", "utf-8");
    await writeFile(join(itemBTaskDir, "spec.md"), "# item b\n", "utf-8");
    await writeFile(join(noneTaskDir, "spec.md"), "# none\n", "utf-8");
    await writeFile(
      join(itemATaskDir, "backlog-link.json"),
      backlogLink(BACKLOG_ITEM, "aidd-pm:04-spec"),
      "utf-8"
    );
    await writeFile(
      join(itemBTaskDir, "backlog-link.json"),
      backlogLink(BACKLOG_ITEM, "aidd-dev:01-plan"),
      "utf-8"
    );
    const sinkDir = join(env.fakeHome, ".config", "aidd", "telemetry");
    await mkdir(sinkDir, { recursive: true });
    await writeFile(
      join(sinkDir, "2026-02-28.jsonl"),
      `${RECORDS.map((r) => JSON.stringify(r)).join("\n")}\n`,
      "utf-8"
    );
    return { projectDir: env.projectDir, fakeHome: env.fakeHome };
  }

  it("merges two tasks declaring the same backlog item into one row, and gives the third its own", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);

    expect(result.exitCode, result.stderr).toBe(0);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const named = envelope.by_backlog.find((row) => row.backlog === BACKLOG_ITEM);
    expect(named?.totals.requests).toBe(2);
    expect(named?.totals.cost_micro_usd).toBe(15_000_000);

    const none = envelope.by_backlog.find((row) => row.declaration === "none");
    expect(none?.totals.requests).toBe(1);
    expect(none?.totals.cost_micro_usd).toBe(3_000_000);
  });

  it("reconciles by_backlog to the same total as the period and as by_task", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const sum = envelope.by_backlog.reduce((total, row) => total + row.totals.requests, 0);
    expect(sum).toBe(envelope.totals.requests);
    const taskSum = envelope.by_task.reduce((total, row) => total + row.totals.requests, 0);
    expect(taskSum).toBe(envelope.totals.requests);
  });

  it("leaves every task folder byte-identical after the report runs", async () => {
    const { projectDir, fakeHome } = await seed();
    const tasksDir = join(projectDir, "aidd_docs", "tasks");
    const before = await snapshot(tasksDir);

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    expect(result.exitCode, result.stderr).toBe(0);

    const after = await snapshot(tasksDir);
    expect(after).toEqual(before);
  });

  it("prints the backlog axis through --axis, naming the item and the none row", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(
      ["telemetry", "report", ...PERIOD, "--axis", "backlog"],
      projectDir,
      fakeHome
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("axis: by backlog");
    expect(result.stdout).toContain(BACKLOG_ITEM);
    expect(result.stdout).toContain("this task declares no backlog item");
  });
});
