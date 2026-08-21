import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * Two records `aidd telemetry read` produced from the captured Codex rollout, seeded
 * straight into the sink rather than re-read here. The read path has its own tests; this
 * file's subject is the report, and going through the read would make it depend on whether
 * the machine happens to have OpenCode installed — `aidd telemetry read` consults every
 * declared tool, and OpenCode's reader shells out with a ten-second budget.
 *
 * Their moments are in July while the day file is named for a much later day. That gap is
 * deliberate: it is what a period has to select through.
 */
const CODEX_RECORDS = [
  {
    kind: "request",
    vendor_id: "019fae6f-2009-7cd3-86b2-b8f83481b160",
    vendor_field: "session_meta.id",
    turn_id: "019fae6f-2084-7d63-b3c1-3d45d0864fe9",
    turn_field: "turn_id",
    model: "gpt-5.6-sol",
    effort: "high",
    event_timestamp: "2026-07-29T15:12:27.889Z",
    input_tokens: 8898,
    output_tokens: 827,
    cache_read_tokens: 65792,
    cache_creation_tokens: 0,
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    step_attribution: "unattributed",
  },
  {
    kind: "request",
    vendor_id: "019fae6f-2009-7cd3-86b2-b8f83481b160",
    vendor_field: "session_meta.id",
    turn_id: "019fae71-ae8b-7850-a982-78d7cd9dba52",
    turn_field: "turn_id",
    model: "gpt-5.6-sol",
    effort: "high",
    event_timestamp: "2026-07-29T15:15:13.692Z",
    input_tokens: 5032,
    output_tokens: 3550,
    cache_read_tokens: 99840,
    cache_creation_tokens: 0,
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    step_attribution: "unattributed",
  },
] as const;

const SINK_DAY_FILE = "2026-08-21.jsonl";
const CODEX_WORK_DAY = "2026-07-29";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

describe("aidd telemetry report", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function seed(
    records: readonly unknown[] = []
  ): Promise<{ projectDir: string; fakeHome: string }> {
    const env = await createTestEnv("telemetry-report");
    cleanup = env.cleanup;
    await gitInit(env.projectDir);
    await mkdir(join(env.projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(env.projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } }),
      "utf-8"
    );
    if (records.length > 0) await seedSink(env.fakeHome, records);
    return env;
  }

  async function seedSink(fakeHome: string, records: readonly unknown[]): Promise<void> {
    const sinkDir = join(fakeHome, ".config", "aidd", "telemetry");
    await mkdir(sinkDir, { recursive: true });
    await writeFile(
      join(sinkDir, SINK_DAY_FILE),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf-8"
    );
  }

  /** Wide enough to reach the day the work happened, whatever day it was stored on. */
  function daysBackToTheWork(): string {
    const elapsed = Date.now() - Date.parse(`${CODEX_WORK_DAY}T00:00:00Z`);
    return String(Math.ceil(elapsed / MILLISECONDS_PER_DAY));
  }

  it("prints nothing measured and exits 0 for a period holding nothing", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report"], projectDir, fakeHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("nothing in this period");
  });

  it("reports what a real session consumed", async () => {
    const { projectDir, fakeHome } = await seed(CODEX_RECORDS);

    const result = await runCli(
      ["telemetry", "report", "--days", daysBackToTheWork()],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    // Recomputed by hand from the rollout's own `last_token_usage` increments, not from
    // anything this codebase produces: turn 019fae6f contributes 8898 input (22229 minus
    // its 20224 cached, per OpenAI's inclusive convention) + 827 output + 65792 cache
    // reads = 75,517; turn 019fae71 contributes 5032 + 3550 + 99840 = 108,422.
    expect(result.stdout).toContain("183,939");
    // Codex's own files carry no dollar figure; a zero here would read as free.
    expect(result.stdout).toContain("amount unknown");
    expect(result.stdout).not.toContain("$0.00");
  });

  it("leaves work outside the period out of it, however recently it was stored", async () => {
    const { projectDir, fakeHome } = await seed(CODEX_RECORDS);

    // The default period ends today and reaches back a week — nowhere near July, though
    // the day file these records live in is named for a much later day than they happened.
    const result = await runCli(["telemetry", "report"], projectDir, fakeHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("nothing in this period");
    expect(result.stdout).not.toContain("183,939");
  });

  it("names every tool that cannot be read, with its own reason", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report"], projectDir, fakeHome);

    expect(result.stdout).toContain("Cursor");
    expect(result.stdout).toContain("not covered");
    expect(result.stdout).toContain("GitHub Copilot");
  });

  it("refuses a period that is not a whole number of days, naming the flag", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", "--days", "0"], projectDir, fakeHome);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("--days");
  });
});
