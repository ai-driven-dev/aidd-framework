import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * The flow axis, end to end: a period breaks down by the orchestrated run the journal's own
 * step sequence already names, through the real CLI binary and real disk - never the
 * in-memory doubles the domain unit tests exercise. Two properties this level alone can
 * prove: two runs of the *same* orchestrating skill in one session stay two rows, not one
 * merged by name, and a hand-run skill mid-flow counts inside it exactly as the journal's
 * own flat sequence forces it to.
 */
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBY";
const VENDOR_ID = "66666666-6666-4666-8666-666666666666";
// A second session with no run journal on disk at all - the shape a session resumed after
// its context was compacted leaves behind: nothing is invoked again, so no `step_start`
// hook fires, while the transcript goes on stating the step on every record it produces.
const NO_JOURNAL_VENDOR_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_ID = "acme/widgets";
const PERIOD = ["--from", "2026-03-01", "--to", "2026-03-31"];

// One session running the same orchestrating skill twice, with a hand-run skill inside the
// first run, and work before either ever opens - the shape phase-1.md's own test scope
// names: two orchestrated runs, a hand-run skill counted inside one of them, and work
// outside any flow.
const JOURNAL_LINES = [
  {
    type: "session_start",
    at: "2026-03-10T09:00:00Z",
    run_id: RUN_ID,
    tool: "codex",
    vendor_id: VENDOR_ID,
    project_id: PROJECT_ID,
  },
  { type: "step_start", at: "2026-03-10T09:20:00Z", skill: "aidd-orchestrator:01-sdlc" },
  { type: "step_start", at: "2026-03-10T09:30:00Z", skill: "aidd-dev:02-implement" },
  { type: "turn_end", at: "2026-03-10T09:50:00Z" },
  { type: "step_start", at: "2026-03-10T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
  { type: "turn_end", at: "2026-03-10T10:30:00Z" },
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
  // Before the first orchestrating step opens - outside every flow.
  record({ turn_id: "before-any-flow", event_timestamp: "2026-03-10T09:10:00Z", cost_usd: 1 }),
  // Inside the first sdlc run, from the orchestrator's own step_start.
  record({
    turn_id: "first-run-orchestrator",
    event_timestamp: "2026-03-10T09:25:00Z",
    cost_usd: 2,
  }),
  // Inside the first sdlc run, but from the hand-run skill - the journal cannot tell it apart.
  record({ turn_id: "first-run-hand-run", event_timestamp: "2026-03-10T09:35:00Z", cost_usd: 3 }),
  // After the turn ended, before the next orchestrating step opens - still the first sdlc
  // run, which a pause does not end. The separating record for this axis: while a turn_end
  // closed a flow, this one fell outside every flow.
  record({
    turn_id: "first-run-after-pause",
    event_timestamp: "2026-03-10T09:55:00Z",
    cost_usd: 5,
  }),
  // Inside the second, distinct sdlc run.
  record({ turn_id: "second-run", event_timestamp: "2026-03-10T10:10:00Z", cost_usd: 4 }),
  // A session whose journal opened no flow, whose own tool named the orchestrating skill.
  record({
    vendor_id: NO_JOURNAL_VENDOR_ID,
    turn_id: "stated-one",
    event_timestamp: "2026-03-11T09:00:00Z",
    cost_usd: 6,
    step_attribution: "tool-stated",
    step: "aidd-orchestrator:01-sdlc",
  }),
  record({
    vendor_id: NO_JOURNAL_VENDOR_ID,
    turn_id: "stated-two",
    event_timestamp: "2026-03-11T10:00:00Z",
    cost_usd: 7,
    step_attribution: "tool-stated",
    step: "aidd-orchestrator:01-sdlc",
  }),
];

interface FlowRow {
  readonly flow?: string;
  readonly attribution: string;
  readonly started_at?: string;
  readonly totals: { readonly requests: number; readonly cost_micro_usd?: number };
}

interface Envelope {
  readonly cost_report_version: number;
  readonly totals: { readonly requests: number; readonly cost_micro_usd?: number };
  readonly by_flow: readonly FlowRow[];
}

describe("aidd telemetry report — by_flow through the real adapter, on real disk", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function seed(): Promise<{ projectDir: string; fakeHome: string }> {
    const env = await createTestEnv("telemetry-flow-axis");
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
      join(sinkDir, "2026-03-31.jsonl"),
      `${RECORDS.map((r) => JSON.stringify(r)).join("\n")}\n`,
      "utf-8"
    );
    return { projectDir: env.projectDir, fakeHome: env.fakeHome };
  }

  it("gives the same orchestrating skill run twice in one session two rows, never merged into one", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);

    expect(result.exitCode, result.stderr).toBe(0);
    const envelope = JSON.parse(result.stdout) as Envelope;

    // Only the runs the journal itself witnessed: the row a second session's own tool named
    // shares the skill's name and is a different claim, told apart by `attribution`.
    const sdlcRuns = envelope.by_flow.filter(
      (row) => row.flow === "aidd-orchestrator:01-sdlc" && row.attribution === "journal-interval"
    );
    expect(sdlcRuns).toHaveLength(2);
    expect(new Set(sdlcRuns.map((row) => row.started_at)).size).toBe(2);
    // The first run holds both the orchestrator's own record and the hand-run skill's -
    // the journal cannot tell them apart, so both count inside it.
    const firstRun = sdlcRuns.find((row) => row.started_at === "2026-03-10T09:20:00Z");
    expect(firstRun?.totals.requests).toBe(3);
    expect(firstRun?.totals.cost_micro_usd).toBe(10_000_000);
    const secondRun = sdlcRuns.find((row) => row.started_at === "2026-03-10T10:00:00Z");
    expect(secondRun?.totals.requests).toBe(1);
    expect(secondRun?.totals.cost_micro_usd).toBe(4_000_000);
  });

  it("gives work before the first orchestrating step its own row, outside any flow", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const outside = envelope.by_flow.find((row) => row.flow === undefined);
    expect(outside?.totals.requests).toBe(1);
    expect(outside?.totals.cost_micro_usd).toBe(1_000_000);
  });

  it("keeps a record made after the turn ended inside the flow that was still running", async () => {
    // The rule this axis changed on 2026-09-04, end to end: a `turn_end` is a pause, not the
    // end of an orchestration. This record sits between the pause at 09:50 and the next
    // orchestrating step at 10:00, so where it lands is the whole difference between the two
    // rules - it used to be counted outside every flow.
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const firstRun = envelope.by_flow.find((row) => row.started_at === "2026-03-10T09:20:00Z");
    expect(firstRun?.totals.cost_micro_usd).toBe(10_000_000); // 2 + 3 + 5, the record at 09:55 included
    const outside = envelope.by_flow.find((row) => row.flow === undefined);
    expect(outside?.totals.cost_micro_usd).toBe(1_000_000); // the 09:10 record alone
  });

  it("reconciles by_flow to the same total as the period", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const sum = envelope.by_flow.reduce((total, row) => total + row.totals.requests, 0);
    expect(sum).toBe(envelope.totals.requests);
    // outside-flow row + two distinct sdlc runs + the run only the tool named
    expect(envelope.by_flow).toHaveLength(4);
  });

  it("prints the flow axis through --axis, naming both runs and the outside-flow row", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(
      ["telemetry", "report", ...PERIOD, "--axis", "flow"],
      projectDir,
      fakeHome
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("axis: by flow");
    expect(result.stdout).toContain("aidd-orchestrator:01-sdlc");
    expect(result.stdout).toContain("outside any flow");
    // The table's own shape, not only the names in it: this artefact exists to be pasted,
    // so a column added or dropped is a break for whatever reads the paste.
    expect(result.stdout).toContain("| Flow | Attribution | Opened at | Total |");
    // A tool-stated row prints its attribution and an em dash where a run would name its
    // opening moment.
    expect(result.stdout).toContain("| aidd-orchestrator:01-sdlc | stated by the tool | — |");
  });

  it("states the limit that belongs to each kind of flow row, and no other", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(
      ["telemetry", "report", ...PERIOD, "--axis", "flow"],
      projectDir,
      fakeHome
    );

    // This period holds both kinds, so both sets of limits apply.
    expect(result.stdout).toContain("a skill run by hand while a flow was open");
    expect(result.stdout).toContain("is every run of that skill at once");
  });

  it("names the flow a session's own tool stated, where its journal opened none", async () => {
    const { projectDir, fakeHome } = await seed();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);
    const envelope = JSON.parse(result.stdout) as Envelope;

    const stated = envelope.by_flow.find((row) => row.attribution === "tool-stated");
    expect(stated?.flow).toBe("aidd-orchestrator:01-sdlc");
    expect(stated?.totals.cost_micro_usd).toBe(13_000_000); // 6 + 7
    // A name is not a run: the row is a bucket drawn from however many runs the tool named.
    expect(stated?.started_at).toBeUndefined();
    // And it never swallows the runs the journal did witness.
    const witnessed = envelope.by_flow.filter((row) => row.attribution === "journal-interval");
    expect(witnessed).toHaveLength(2);
  });
});
