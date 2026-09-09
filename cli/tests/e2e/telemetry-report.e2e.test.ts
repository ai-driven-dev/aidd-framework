import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/** Seeded straight into the sink: going through the read would depend on whether the machine
 * has OpenCode installed. Their July moments sit in a day file named for a much later day. */
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

/** Three records the filter tests narrow over: two inside the period, one carrying a model no
 * in-period record names — known to a sweep of the file, idle in every in-period selection. */
const FILTER_RECORDS = [
  {
    kind: "request",
    vendor_id: "f-1",
    vendor_field: "session_meta.id",
    turn_id: "f-turn-1",
    turn_field: "turn_id",
    model: "gpt-5.6-sol",
    event_timestamp: "2026-07-29T15:12:27.889Z",
    input_tokens: 100,
    output_tokens: 10,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    step_attribution: "tool-stated",
    step: "implement",
    project_id: "acme/widgets",
  },
  {
    kind: "request",
    vendor_id: "f-2",
    vendor_field: "session_meta.id",
    turn_id: "f-turn-2",
    turn_field: "turn_id",
    model: "gpt-4",
    event_timestamp: "2026-07-29T15:20:00.000Z",
    input_tokens: 50,
    output_tokens: 5,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    step_attribution: "unattributed",
    project_id: "acme/gadgets",
  },
  {
    kind: "request",
    vendor_id: "f-3",
    vendor_field: "session_meta.id",
    turn_id: "f-turn-3",
    turn_field: "turn_id",
    model: "haiku",
    // Outside every period these tests ask for - the sink still opens this file to build
    // its "ever seen" sets, so "haiku" reads as known without ever being in scope.
    event_timestamp: "2020-01-01T00:00:00.000Z",
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    sink_schema_version: 2,
    provenance: "local-read",
    tool: "codex",
    step_attribution: "unattributed",
    project_id: "acme/old-project",
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
    // anything this codebase produces: 75,517 for one turn and 108,422 for the other.
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

  it("keeps only the project asked for, saying so in the object it answers with", async () => {
    const { projectDir, fakeHome } = await seed(FILTER_RECORDS);

    const result = await runCli(
      ["telemetry", "report", "--days", daysBackToTheWork(), "--project", "acme/widgets", "--json"],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.filters).toEqual({ project: "acme/widgets" });
    expect(envelope.totals.requests).toBe(1);
    expect(envelope.by_project).toEqual([{ project: "acme/widgets", totals: envelope.totals }]);
  });

  it("narrows two filters to their intersection, project as filter and step as axis", async () => {
    const { projectDir, fakeHome } = await seed(FILTER_RECORDS);

    const result = await runCli(
      [
        "telemetry",
        "report",
        "--days",
        daysBackToTheWork(),
        "--project",
        "acme/widgets",
        "--model",
        "gpt-5.6-sol",
        "--json",
      ],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.totals.requests).toBe(1);
    expect(envelope.by_step).toEqual([
      { step: "implement", attribution: "tool-stated", totals: envelope.totals },
    ]);
  });

  it("names a project nobody ever worked in, apart from a total of zero", async () => {
    const { projectDir, fakeHome } = await seed(FILTER_RECORDS);

    const result = await runCli(
      [
        "telemetry",
        "report",
        "--days",
        daysBackToTheWork(),
        "--project",
        "never-worked-here",
        "--json",
      ],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.empty_selection).toEqual({
      filter: "project",
      value: "never-worked-here",
      known: false,
    });
    expect(result.stdout).not.toContain('"cost_micro_usd"');
  });

  it("tells a known value idle in this period apart from one never seen at all", async () => {
    const { projectDir, fakeHome } = await seed(FILTER_RECORDS);

    const result = await runCli(
      ["telemetry", "report", "--days", daysBackToTheWork(), "--model", "haiku"],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("known, but no work here");
    expect(result.stdout).not.toContain("never named this");
  });

  it("prints the composed selection in the header a person reads", async () => {
    const { projectDir, fakeHome } = await seed(FILTER_RECORDS);

    const result = await runCli(
      [
        "telemetry",
        "report",
        "--days",
        daysBackToTheWork(),
        "--project",
        "acme/widgets",
        "--step",
        "implement",
      ],
      projectDir,
      fakeHome
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("filters: project=acme/widgets, step=implement");
  });
});
