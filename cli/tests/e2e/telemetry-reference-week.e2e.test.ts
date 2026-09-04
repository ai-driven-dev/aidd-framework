import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH } from "./helpers.js";

/**
 * The reference week, held to the built command.
 *
 * Every other telemetry e2e proves one axis on data written straight into the sink. This
 * one proves the axes reconcile to each other on a week produced by the shipped hook and
 * read out of each tool's own session files — capture, join and analysis in one scenario.
 *
 * The scenario itself lives in `scripts/lib/telemetry-reference-week.cjs`, shared with
 * `scripts/telemetry-reference-week.cjs`, which prints what this asserts. One builder, so
 * the demo cannot drift from the test.
 */
const week = createRequire(import.meta.url)(
  "../../../scripts/lib/telemetry-reference-week.cjs"
) as ReferenceWeekModule;

interface Totals {
  readonly requests: number;
  readonly cost_micro_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
}
interface Row {
  readonly totals: Totals;
}
interface Envelope {
  readonly totals: Totals;
  readonly by_day: readonly Row[];
  readonly by_flow: readonly (Row & { readonly flow?: string })[];
  readonly by_step: readonly (Row & { readonly step?: string; readonly attribution: string })[];
  readonly by_task: readonly (Row & { readonly task?: string })[];
  readonly by_backlog: readonly (Row & { readonly backlog?: string })[];
  readonly by_model: readonly (Row & { readonly model?: string })[];
  readonly by_project: readonly (Row & { readonly project?: string })[];
  readonly by_person: readonly (Row & {
    readonly resolution: string;
    readonly person?: string;
    readonly identities: readonly string[];
  })[];
  readonly by_tool: readonly (Row & {
    readonly tool: string;
    readonly coverage: string;
    readonly reason?: string;
    readonly session_totals?: Totals;
  })[];
}
interface BuiltWeek {
  /** Where the shared destination's records land — the one thing a test may delete to ask
   * what `report` can rebuild on its own. */
  readonly sinkDir: string;
  readonly expected: {
    readonly requests: number;
    readonly totalTokens: number;
    readonly days: readonly string[];
    readonly models: readonly string[];
    readonly requestTools: readonly string[];
    readonly sessionOnlyTool: string;
    readonly uncoveredTools: readonly string[];
    readonly projects: readonly string[];
    readonly people: readonly string[];
    readonly flow: string;
    readonly tasks: readonly string[];
    readonly backlogItem: string;
  };
}
interface ReferenceWeekModule {
  buildReferenceWeek(options: { root: string; cliPath: string }): BuiltWeek;
  reportReferenceWeek(built: BuiltWeek, args?: readonly string[]): string;
}

function tokensIn(totals: Totals): number {
  return (
    (totals.input_tokens ?? 0) +
    (totals.output_tokens ?? 0) +
    (totals.cache_read_tokens ?? 0) +
    (totals.cache_creation_tokens ?? 0)
  );
}

function sumRequests(rows: readonly Row[]): number {
  return rows.reduce((total, row) => total + row.totals.requests, 0);
}

function sumTokens(rows: readonly Row[]): number {
  return rows.reduce((total, row) => total + tokensIn(row.totals), 0);
}

describe("the reference week", () => {
  let root: string;
  let built: BuiltWeek;
  let envelope: Envelope;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "aidd-reference-week-e2e-"));
    built = week.buildReferenceWeek({ root, cliPath: CLI_PATH });
    envelope = JSON.parse(week.reportReferenceWeek(built, ["--json"])) as Envelope;
  }, 120_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("counts what the week actually produced", () => {
    expect(envelope.totals.requests).toBe(built.expected.requests);
    expect(tokensIn(envelope.totals)).toBe(built.expected.totalTokens);
  });

  it("reconciles every breakdown to that same total", () => {
    // `by_tool` included, and its inclusion is the point: a session-total tool carries its
    // figure in `session_totals`, a field of its own, so `totals` still sums like every
    // other axis. Leaving it out — on the theory that Copilot's record could not belong to
    // a request sum — would drop the one axis that catches a tool's figures being stored
    // against another tool's sessions, which is exactly the defect this week's own harness
    // was found to be asserting.
    const breakdowns = [
      envelope.by_day,
      envelope.by_flow,
      envelope.by_step,
      envelope.by_task,
      envelope.by_backlog,
      envelope.by_model,
      envelope.by_tool,
      envelope.by_project,
      envelope.by_person,
    ];
    for (const rows of breakdowns) {
      expect(sumRequests(rows)).toBe(envelope.totals.requests);
      expect(sumTokens(rows)).toBe(tokensIn(envelope.totals));
    }
  });

  it("breaks the week down by the flow that ran, keeping what ran outside one apart", () => {
    const named = envelope.by_flow.filter((row) => row.flow !== undefined);
    expect(named.map((row) => row.flow)).toEqual([built.expected.flow]);
    expect(named[0]?.totals.requests).toBe(3);

    const outside = envelope.by_flow.filter((row) => row.flow === undefined);
    expect(outside).toHaveLength(1);
    expect(outside[0]?.totals.requests).toBe(4);
  });

  it("leads with the run it can name, though more of the week fell outside every flow", () => {
    // The week's own figures make this the case that matters: 4 requests outside every flow
    // against 3 inside the one run. Ordered by size alone the remainder led the table, while
    // `by_task` and `by_backlog` beside it led with their largest named row.
    expect(envelope.by_flow.map((row) => row.flow)).toEqual([built.expected.flow, undefined]);
  });

  it("prints, beside those figures, the two things this axis cannot tell apart", () => {
    const rendered = week.reportReferenceWeek(built, ["--axis", "flow"]);

    expect(rendered).toContain("a skill run by hand while a flow was open is counted inside it");
    expect(rendered).toContain("00-async-dev, 01-sdlc or 02-backlog");
  });

  it("names each step's attribution, all three strengths in one week", () => {
    const strengths = new Set(envelope.by_step.map((row) => row.attribution));
    expect(strengths).toEqual(new Set(["tool-stated", "journal-interval", "unattributed"]));
  });

  it("breaks the week down by task, and by the backlog item a task declared", () => {
    // Distinct, because one task can hold two rows since `cost_report_version` 12 - one for
    // what a declaration covered, one for what only a written file names, the same
    // `(name x attribution)` shape `by_step` has always had. What this asserts is which
    // tasks the week names, never how many routes named each.
    const tasks = [...new Set(envelope.by_task.map((row) => row.task).filter(Boolean))];
    expect(tasks.sort()).toEqual([...built.expected.tasks].sort());

    const declared = envelope.by_backlog.filter((row) => row.backlog !== undefined);
    expect(declared.map((row) => row.backlog)).toEqual([built.expected.backlogItem]);
    // The task with a backlog link and the task without must not merge into one row. Three
    // requests since version 12, not two: that session's 08:07 record precedes its own
    // declaration at 08:12 by five minutes, its journal witnessed it, and it wrote into that
    // one task folder and no other - so the written-file route names it too.
    expect(declared[0]?.totals.requests).toBe(3);
    expect(sumRequests(envelope.by_backlog)).toBe(envelope.totals.requests);
  });

  it("keeps a session-total tool out of the request totals and still shows its figure", () => {
    const byId = new Map(envelope.by_tool.map((row) => [row.tool, row]));

    for (const tool of built.expected.requestTools) {
      expect(byId.get(tool)?.totals.requests).toBeGreaterThan(0);
    }
    const sessionOnly = byId.get(built.expected.sessionOnlyTool);
    expect(sessionOnly?.totals.requests).toBe(0);
    expect(tokensIn(sessionOnly?.session_totals ?? { requests: 0 })).toBeGreaterThan(0);
  });

  it("names every tool it cannot read, with the reason, rather than omitting it", () => {
    const byId = new Map(envelope.by_tool.map((row) => [row.tool, row]));
    for (const tool of built.expected.uncoveredTools) {
      const row = byId.get(tool);
      expect(row, `${tool} is missing from by_tool`).toBeDefined();
      expect(row?.totals.requests).toBe(0);
      expect(row?.reason).toBeTruthy();
    }
  });

  it("splits the week by person and by project, without either standing in for the other", () => {
    expect(envelope.by_person.flatMap((row) => row.identities).sort()).toEqual(
      [...built.expected.people].sort()
    );
    expect(envelope.by_project.map((row) => row.project).sort()).toEqual(
      [...built.expected.projects].sort()
    );
  });

  it("names a teammate's records as an identity it cannot resolve, never as nobody", () => {
    // The report runs on Ada's machine. Bo's identifier is real and its records are here,
    // but nothing local maps it to a person — so it gets its own row, named for what is
    // known. Resolving people across machines is a destination's job, not this command's.
    const resolutions = envelope.by_person.map((row) => row.resolution);
    expect(resolutions).toContain("mapped");
    expect(resolutions).toContain("unresolved");
  });

  it("gives every day of the period a row, and only the worked days a figure", () => {
    const worked = envelope.by_day.filter((row) => row.totals.requests > 0);
    expect(worked).toHaveLength(built.expected.days.length);
  });

  it("states no amount anywhere, because no tool supplies one", () => {
    expect(envelope.totals.cost_micro_usd).toBeUndefined();
    const printed = week.reportReferenceWeek(built, ["--axis", "total"]);
    expect(printed).toContain("amount unknown");
    expect(printed).not.toContain("$");
  });
});

/**
 * The commands a person actually has to run.
 *
 * `report` reads the sink, and until this nothing filled the sink but `aidd telemetry read`.
 * Forgetting that step was answered with "nothing in this period" — the one sentence
 * indistinguishable from a week where nothing was spent. Held here against the built binary,
 * on a week whose figures are known, because the whole point is what happens when a person
 * runs one command instead of two.
 */
describe("a report that needs no read first", () => {
  let root: string;
  let built: BuiltWeek;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "aidd-reference-week-catchup-"));
    built = week.buildReferenceWeek({ root, cliPath: CLI_PATH });
  }, 120_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("answers with figures on a sink nobody has filled", () => {
    // Everything the week stored, thrown away: only what `report` reads back for itself can
    // account for what comes out below.
    rmSync(join(built.sinkDir, "telemetry"), { recursive: true, force: true });

    const envelope = JSON.parse(week.reportReferenceWeek(built, ["--json"])) as Envelope;

    // Ada's own four, and only those: the report runs under her home, and Bo's session files
    // are under his. Catching up reads what this machine can read — never what it cannot.
    expect(envelope.totals.requests).toBe(4);
    expect(sumRequests(envelope.by_day)).toBe(4);
    expect(sumRequests(envelope.by_flow)).toBe(4);
    expect(sumRequests(envelope.by_task)).toBe(4);
  });
});

/**
 * Git exports `GIT_DIR` and its siblings into every process it spawns, so a suite run from
 * inside a hook — `pre-push` running the tests, which is how this was found — inherits a
 * pointer to the real repository. The builder's own `git init` then lands in a temp
 * directory while `git remote add origin` operates on this repository, which already has
 * one, and the whole week fails to build with `exited 3`.
 *
 * It passed by hand and failed from the hook, which is precisely the shape of that leak.
 * Asserted here rather than left to whichever runner happens to be inside git, because a
 * harness that only works outside one is a harness nobody can trust from CI either.
 */
describe("the week builds inside a git hook's own environment", () => {
  it("ignores a leaked GIT_DIR rather than resolving the real repository", () => {
    const root = mkdtempSync(join(tmpdir(), "aidd-reference-week-gitdir-"));
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = join(process.cwd(), "..", ".git");
    try {
      const built = week.buildReferenceWeek({ root, cliPath: CLI_PATH });
      const envelope = JSON.parse(week.reportReferenceWeek(built, ["--json"])) as Envelope;

      expect(envelope.totals.requests).toBe(built.expected.requests);
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
