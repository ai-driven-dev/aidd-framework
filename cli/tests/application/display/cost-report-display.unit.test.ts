import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { printCostReport } from "../../../src/application/display/cost-report-display.js";
import { CLIOutput } from "../../../src/application/output.js";
import { buildCostReport, type CostReportInput } from "../../../src/domain/models/cost-report.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

/** Extends the real output rather than standing in for it: a double built from an object
 * literal would have to be widened to pass as a `CLIOutput`, and a widened double stops
 * failing the day the class grows a method the printer starts calling. */
class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
}

function record(overrides: Partial<TelemetrySinkRecord>): TelemetrySinkRecord {
  return {
    sink_schema_version: 2,
    kind: "request",
    provenance: "local-read",
    tool: "claude",
    vendor_id: "s-1",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
    ...overrides,
  };
}

/** What a tool can supply is not what these tests are about; they declare the minimum the
 * type requires, and the declarations' own truth is checked in
 * tests/domain/tools/telemetry-route-supply.unit.test.ts against captured files. */
const NO_CAPABILITY = {
  localRead: null,
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

function printed(overrides: Partial<CostReportInput> = {}): string {
  const output = new CapturingOutput();
  printCostReport(
    output,
    buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [],
      journals: [],
      declaredTools: [
        { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
        { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
        {
          tool: "cursor",
          coverage: "not-covered",
          reason: "It writes no token count.",
          capability: NO_CAPABILITY,
        },
      ],
      undatedRecords: 0,
      unreadableLines: 0,
      ...overrides,
    })
  );
  return output.lines.join("\n");
}

describe("printCostReport", () => {
  it("answers the question before any breakdown is read", () => {
    const out = printed({
      records: [record({ cost_usd: 4.2, input_tokens: 100, cache_read_tokens: 900 })],
    });
    const [first, , sessions, requests, tokens, cost] = out.split("\n");

    expect(first).toContain("2026-08-17 to 2026-08-21");
    expect(sessions).toContain("sessions");
    expect(requests).toContain("requests");
    expect(tokens).toContain("1,000");
    expect(tokens).toContain("90% cache");
    expect(cost).toContain("$4.20");
  });

  it("says which selection it answered, in the header", () => {
    const out = printed({
      records: [record({ cost_usd: 1, project_id: "acme/widgets" })],
      filters: { project: "acme/widgets" },
    });

    expect(out.split("\n")[0]).toContain("filters: project=acme/widgets");
  });

  it("names the filter that emptied a selection, and suppresses the noise under it", () => {
    const out = printed({
      records: [record({ cost_usd: 1, project_id: "acme/widgets" })],
      knownValues: { projects: new Set(["acme/widgets"]), steps: new Set(), models: new Set() },
      filters: { project: "never-worked-here" },
    });

    expect(out).toContain("no record has ever named this project");
    expect(out).not.toContain("by tool");
    expect(out).not.toContain("by day");
  });

  it("says a task or a tool was never seen without claiming a record check it never ran", () => {
    const out = printed({
      records: [record({ cost_usd: 1 })],
      filters: { tool: "opencode" },
    });

    expect(out).toContain("it is not one of the tools this build knows");
    expect(out).not.toContain("no record has ever named this tool");
  });

  it("calls a zero row 'nothing in this selection', never 'this period', once a filter is active", () => {
    // Codex only has a gadgets record - filtered to widgets alone, its row is zero, but
    // the selection is why, not real idleness.
    const out = printed({
      records: [
        record({ turn_id: "a", cost_usd: 1, tool: "claude", project_id: "acme/widgets" }),
        record({ turn_id: "b", cost_usd: 1, tool: "codex", project_id: "acme/gadgets" }),
      ],
      filters: { project: "acme/widgets" },
    });

    expect(out).toMatch(/Codex\s+nothing in this selection/u);
    expect(out).not.toContain("nothing in this period");
  });

  it("still calls a zero row 'nothing in this period' when the whole period, not a filter, is why", () => {
    const out = printed({ records: [] });

    expect(out).toContain("nothing in this period");
    expect(out).not.toContain("nothing in this selection");
  });

  it("calls a task selection's own zero rows 'nothing in this selection' too", () => {
    const out = printed({
      records: [record({ vendor_id: "s-1", cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" })],
      journals: [
        {
          vendorId: "s-1",
          tool: "claude",
          writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_01_x/plan.md"],
          taskIntervals: [],
        },
      ],
      task: "2026_08/2026_08_01_x",
    });

    expect(out).toMatch(/2026-08-18\s+nothing in this selection/u);
  });

  it("labels active time as per-session and keeps it out of every breakdown", () => {
    const out = printed({
      records: [
        record({ cost_usd: 1, step: "aidd-dev:02-implement", step_attribution: "tool-stated" }),
        record({ kind: "session", active_time_s: 2820 }),
      ],
    });

    expect(out).toContain("47 min");
    expect(out).toContain("not attributable to steps");
    const breakdown = out.slice(out.indexOf("by step"));
    expect(breakdown).not.toContain("min");
  });

  it("prints the three attribution shares together", () => {
    const out = printed({
      records: [
        record({ turn_id: "a", cost_usd: 6, step: "s", step_attribution: "tool-stated" }),
        record({ turn_id: "b", cost_usd: 3, step: "s", step_attribution: "journal-interval" }),
        record({ turn_id: "c", cost_usd: 1 }),
      ],
    });
    const mix = out.slice(out.indexOf("attribution "));

    expect(mix).toContain("stated by the tool");
    expect(mix).toContain("from a journal interval");
    expect(mix).toContain("unattributed");
    expect(mix).toContain(" 60%");
    expect(mix).toContain(" 30%");
    expect(mix).toContain(" 10%");
  });

  it("never says work ran outside every step, and never calls it a residual", () => {
    const out = printed({ records: [record({ cost_usd: 1 })] });

    expect(out).toContain("unattributed");
    expect(out).not.toContain("residual");
    expect(out).not.toContain("no step");
    expect(out).not.toContain("outside");
  });

  it("prints an unknown amount for a tool whose records carry none, never a zero", () => {
    const out = printed({ records: [record({ tool: "codex", input_tokens: 8898 })] });

    expect(out).toContain("amount unknown");
    expect(out).not.toContain("$0.00");
  });

  it("prints a tool that cannot be read as not covered, with its own reason", () => {
    const out = printed({ records: [record({ cost_usd: 1 })] });

    expect(out).toContain("Cursor");
    expect(out).toContain("not covered — It writes no token count.");
  });

  it("prints a session total on its own tool row, not 'nothing in this period' (#697)", () => {
    const output = new CapturingOutput();
    const COPILOT_CAPABILITY = {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
      export: { tokenCounters: false, amount: false, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: false,
    } as const;
    printCostReport(
      output,
      buildCostReport({
        fromDay: "2026-08-17",
        toDay: "2026-08-21",
        records: [
          record({
            tool: "copilot",
            kind: "session",
            provenance: "local-read",
            input_tokens: 10,
            output_tokens: 42,
            cache_read_tokens: 0,
            cache_creation_tokens: 21070,
          }),
        ],
        journals: [],
        declaredTools: [{ tool: "copilot", coverage: "covered", capability: COPILOT_CAPABILITY }],
        undatedRecords: 0,
        unreadableLines: 0,
      })
    );
    const out = output.lines.join("\n");

    expect(out).toContain("21,122 tokens (session total, not requests)");
    const copilotRow = out.split("\n").find((line) => line.includes("Copilot")) ?? "";
    expect(copilotRow).not.toContain("nothing in this period");
  });

  it("separates a tool that measured nothing from one that could not be read", () => {
    const out = printed({ records: [record({ cost_usd: 1 })] });
    const codexRow = out.split("\n").find((line) => line.includes("Codex")) ?? "";
    const cursorRow = out.split("\n").find((line) => line.includes("Cursor")) ?? "";

    expect(codexRow).toContain("nothing in this period");
    expect(cursorRow).toContain("not covered");
    expect(codexRow).not.toContain("not covered");
  });

  it("prints an empty period as nothing measured, not as zeros", () => {
    const out = printed();

    expect(out).toContain("nothing in this period");
    expect(out).not.toContain("$0.00");
    expect(out).not.toContain("by step");
  });

  it("says how much of the read it could not place or could not parse", () => {
    const out = printed({ undatedRecords: 3, unreadableLines: 2 });

    expect(out).toContain("3 records carry no moment and are in no period");
    expect(out).toContain("2 lines could not be read");
  });

  it("breaks a period down by tokens when no amount exists anywhere in it", () => {
    const out = printed({
      records: [record({ tool: "codex", model: "gpt-5.6-sol", input_tokens: 10 })],
    });

    expect(out).toContain("of tokens");
    expect(out).not.toContain("of cost");
  });

  it("names a task by its identity, never by a path it was derived from", () => {
    const out = printed({
      records: [record({ vendor_id: "s-1", cost_usd: 1 })],
      journals: [
        {
          vendorId: "s-1",
          tool: "claude-code",
          writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md"],
          taskIntervals: [],
        },
      ],
      task: "2026_08/2026_08_21_cost-reporter",
    });

    expect(out).toContain("task 2026_08/2026_08_21_cost-reporter");
    expect(out).not.toContain("aidd_docs/");
    expect(out).not.toContain("plan.md");
  });

  it("carries no prompt, code or diff, over records and journals that hold them", () => {
    const out = printed({
      records: [
        record({
          cost_usd: 1,
          model: "opus",
          step: "aidd-dev:02-implement",
          step_attribution: "tool-stated",
        }),
      ],
      journals: [
        {
          vendorId: "s-1",
          tool: "claude-code",
          projectId: "acme-widgets",
          writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md"],
          taskIntervals: [],
        },
      ],
    });

    // Named rather than "no slash at all": a task's identity legitimately carries one, and
    // an assertion that broke on it would say nothing about a leaked path.
    expect(out).not.toContain("aidd_docs");
    expect(out).not.toContain(".md");
    expect(out).not.toContain("acme-widgets");
  });

  it("prints a day with nothing as a row of zeros, never an omitted row", () => {
    const out = printed({
      records: [record({ cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" })],
    });

    expect(out).toMatch(/2026-08-18\s+nothing in this period/u);
  });

  it("names how many days a long period carries, rather than printing every row", () => {
    const records = Array.from({ length: 40 }, (_, i) =>
      record({
        turn_id: `t-${i}`,
        cost_usd: 1,
        event_timestamp: `2026-01-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const out = printed({ fromDay: "2026-01-01", toDay: "2026-02-09", records });

    expect(out).toContain("40 days in this period");
    expect(out).toContain("--json");
    expect(out).not.toContain("2026-01-15");
  });

  it("gives a record with no project its own row, named as unknown", () => {
    const out = printed({
      records: [
        record({ turn_id: "a", cost_usd: 2, project_id: "acme/widgets" }),
        record({ turn_id: "b", cost_usd: 1 }),
      ],
    });
    const projects = out.slice(out.indexOf("by project"));

    expect(projects).toContain("acme/widgets");
    expect(projects).toContain("no known project");
  });

  it("gives a record with no model its own row, named as unknown, rather than vanishing", () => {
    const out = printed({
      records: [
        record({ turn_id: "a", cost_usd: 2, model: "opus" }),
        record({ turn_id: "b", cost_usd: 1 }),
      ],
    });
    const models = out.slice(out.indexOf("by model"), out.indexOf("by project"));

    expect(models).toContain("opus");
    expect(models).toContain("no known model");
  });
});
