import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import {
  buildCostReport,
  type CostReportInput,
} from "../../../src/contexts/telemetry/domain/cost-report.js";
import type { TelemetrySinkRecord } from "../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { padTo, printCostReport } from "../../../src/presentation/display/cost-report-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

/** Extends the real output rather than standing in for it: a widened double stops failing
 * the day the class grows a method the printer starts calling. */
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

/** What a tool can supply is not what these tests are about: the minimum the type requires,
 * whose own truth is checked against captured files elsewhere. */
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
      measurementEnabled: true,
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
          flowIntervals: [],
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
      localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
      export: { tokenCounters: false, amount: false, toolStatedStep: false, agentName: false },
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
        measurementEnabled: true,
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
          flowIntervals: [],
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
          flowIntervals: [],
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

  it("prints the prompt that caused the work, dated, largest first", () => {
    const out = printed({
      records: [
        record({
          turn_id: "a",
          prompt_id: "p-1",
          cost_usd: 2,
          event_timestamp: "2026-08-18T09:00:00Z",
        }),
        record({
          turn_id: "b",
          prompt_id: "p-2",
          cost_usd: 1,
          event_timestamp: "2026-08-18T10:00:00Z",
        }),
      ],
    });

    expect(out).toContain("by prompt");
    const prompts = out.split("\n").filter((line) => line.includes("p-1") || line.includes("p-2"));
    expect(prompts[0]).toContain("p-1");
    expect(prompts[0]).toContain("2026-08-18T09:00:00Z");
  });

  // The first axis whose cardinality is unbounded, so it truncates rather than suppressing
  // every row: a partial series is a lie about continuity, a top N of a ranking is not.
  it("names how many prompts a long period carries beyond the ones it prints", () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      record({ turn_id: `t-${i}`, prompt_id: `p-${i}`, cost_usd: 30 - i })
    );
    const out = printed({ records });

    expect(out).toContain("p-0");
    expect(out).not.toContain("p-29");
    expect(out).toContain("20 more prompts");
    expect(out).toContain("--json");
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

describe("printCostReport — a label wider than its column", () => {
  // Measured on a real report: a project id can be a remote 41 characters wide against a
  // 26-wide column, and `padEnd` returns a longer string unchanged.
  it("keeps a separator between an overlong label and its share", () => {
    const long = "git@github.com:ai-driven-dev/framework.git";

    const out = printed({ records: [record({ cost_usd: 1, project_id: long })] });
    const row = out.split("\n").find((line) => line.includes(long));

    expect(row).toBeDefined();
    expect(row).not.toContain(`${long}100%`);
    expect(row).toMatch(new RegExp(`${long.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s`, "u"));
  });

  it("still separates a label exactly as wide as its column from what follows it", () => {
    // 26 is `LABEL_WIDTH`, private to this module: the only length where `padTo`'s `>=` and
    // `>` decide something different, and nothing above ever sits on that boundary.
    const exact = "a".repeat(26);

    const padded = padTo(exact, 26);

    expect(padded).toBe(`${exact} `);
  });
});

describe("printCostReport — measurement is off", () => {
  it("says the project's switch is off, on an empty period", () => {
    const out = printed({ measurementEnabled: false });

    expect(out).toMatch(/this project's own switch is off/u);
    expect(out).not.toMatch(/\bsessions\s+0\b/u);
    expect(out).toContain("nothing in this period");
  });

  it("says nothing about the switch when it is on, even on an empty period", () => {
    const out = printed({ measurementEnabled: true });

    expect(out).not.toContain("switch is off");
    expect(out).not.toMatch(/\bsessions\s+0\b/u);
  });

  // The sink is person-scoped while the switch is project-scoped, so a genuine figure below
  // an "off" claim is ordinary: the sentence must name its scope, not deny the figure.
  it("names the sink's real scope, never denying the figure it sits beside", () => {
    const out = printed({
      measurementEnabled: false,
      records: [record({ cost_usd: 4.2, input_tokens: 100 })],
    });

    expect(out).toMatch(/this project's own switch is off/u);
    expect(out).toMatch(/not scoped to it/u);
    expect(out).toContain("$4.20");
    expect(out).toMatch(/\bcost\s+\$4\.20/u);
  });
});
