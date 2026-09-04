import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { printCostReport } from "../../../src/application/display/cost-report-display.js";
import { CLIOutput } from "../../../src/application/output.js";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportToolDeclaration,
} from "../../../src/domain/models/cost-report.js";
import {
  COST_REPORT_ENVELOPE_VERSION,
  toCostReportEnvelope,
} from "../../../src/domain/models/cost-report-envelope.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

const DECLARED: readonly CostReportToolDeclaration[] = [
  {
    tool: "claude",
    coverage: "covered",
    capability: {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: true },
      export: { tokenCounters: true, amount: true, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: true,
    },
  },
  {
    tool: "cursor",
    coverage: "not-covered",
    reason: "It writes no token count in any file it produces.",
    capability: {
      localRead: null,
      export: null,
      journalAttributable: true,
      taskAttributable: false,
    },
  },
  {
    tool: "copilot",
    coverage: "covered",
    reason:
      "Its own file names outputTokens per turn, but session.shutdown carries all four " +
      "counters for the whole session — a session total, never a sum of requests.",
    capability: {
      localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
      export: { tokenCounters: false, amount: false, toolStatedStep: false },
      journalAttributable: true,
      taskAttributable: false,
    },
  },
];

function record(overrides: Partial<TelemetrySinkRecord> = {}): TelemetrySinkRecord {
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

function envelopeOf(overrides: Partial<CostReportInput> = {}) {
  return toCostReportEnvelope(
    buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [],
      journals: [],
      declaredTools: DECLARED,
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
      ...overrides,
    })
  );
}

describe("toCostReportEnvelope", () => {
  it("carries a version a consumer can refuse", () => {
    expect(envelopeOf().cost_report_version).toBe(COST_REPORT_ENVELOPE_VERSION);
  });

  it("carries the period absolutely, as it resolved", () => {
    expect(envelopeOf().period).toEqual({ from_day: "2026-08-17", to_day: "2026-08-21" });
  });

  // Finding 3 (review.md, "one route, and every sentence about it true"): --json had no
  // way to say measurement was off at all, breaking the spec's own constraint that a
  // report says whether measurement is on.
  it("carries measurement_enabled, the one field the terminal rendering could see and this could not", () => {
    expect(envelopeOf({ measurementEnabled: true }).measurement_enabled).toBe(true);
    expect(envelopeOf({ measurementEnabled: false }).measurement_enabled).toBe(false);
  });

  it("carries no filters object at all for an unfiltered period", () => {
    expect(envelopeOf().filters).toBeUndefined();
  });

  it("carries only the generic filters given, snake_case field names untouched", () => {
    const envelope = envelopeOf({
      records: [record({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" })],
      filters: { project: "acme/widgets" },
    });

    expect(envelope.filters).toEqual({ project: "acme/widgets" });
  });

  it("names the filter that emptied a selection, distinguishing known from never seen", () => {
    const envelope = envelopeOf({
      records: [record({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" })],
      knownValues: { projects: new Set(["acme/widgets"]), steps: new Set(), models: new Set() },
      filters: { project: "never-worked-here" },
    });

    expect(envelope.empty_selection).toEqual({
      filter: "project",
      value: "never-worked-here",
      known: false,
    });
  });

  it("keeps an absent counter absent, never turning it into a zero", () => {
    const envelope = envelopeOf({ records: [record({ input_tokens: 0 })] });

    expect(envelope.totals.input_tokens).toBe(0);
    expect(envelope.totals).not.toHaveProperty("output_tokens");
    expect(envelope.totals).not.toHaveProperty("cost_micro_usd");
  });

  it("carries money as whole micro-dollars, so summing reports stays exact", () => {
    expect(envelopeOf({ records: [record({ cost_usd: 4.2 })] }).totals.cost_micro_usd).toBe(
      4200000
    );
  });

  it("says what each tool can supply on each route, from its declaration", () => {
    const byTool = Object.fromEntries(
      envelopeOf().by_tool.map((row) => [row.tool, row.capability])
    );

    expect(byTool.claude).toEqual({
      local_read: { token_counters: true, amount: false, tool_stated_step: true },
      export: { token_counters: true, amount: true, tool_stated_step: false },
      journal_attributable: true,
      task_attributable: true,
    });
    // Null is not "supplies nothing": this tool declares no such route at all.
    expect(byTool.cursor).toEqual({
      local_read: null,
      export: null,
      journal_attributable: true,
      task_attributable: false,
    });
  });

  it("carries session_totals snake_case, beside the ordinary totals, only where measured (#697)", () => {
    const withCopilot = envelopeOf({
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
    });
    const copilot = withCopilot.by_tool.find((row) => row.tool === "copilot");
    const claude = withCopilot.by_tool.find((row) => row.tool === "claude");

    expect(copilot?.session_totals).toEqual({
      requests: 0,
      input_tokens: 10,
      output_tokens: 42,
      cache_read_tokens: 0,
      cache_creation_tokens: 21070,
    });
    expect(copilot?.totals).toEqual({ requests: 0 });
    expect(claude).not.toHaveProperty("session_totals");
  });

  it("carries why an uncovered tool cannot be read", () => {
    const cursor = envelopeOf().by_tool.find((row) => row.tool === "cursor");

    expect(cursor?.coverage).toBe("not-covered");
    expect(cursor?.reason).toBe("It writes no token count in any file it produces.");
  });

  it("carries all four attribution strengths, strongest first, zeros included", () => {
    expect(envelopeOf().attribution.map((row) => row.attribution)).toEqual([
      "tool-stated",
      "prompt-matched",
      "journal-interval",
      "unattributed",
    ]);
  });

  it("gives a record with no project its own row, project absent rather than a placeholder", () => {
    const envelope = envelopeOf({
      records: [
        record({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" }),
        record({ turn_id: "b", cost_usd: 1 }),
      ],
    });

    expect(envelope.by_project.find((row) => row.project === "acme/widgets")).toBeDefined();
    const unknown = envelope.by_project.find((row) => !("project" in row));
    expect(unknown?.totals.requests).toBe(1);
  });

  // snake_case on the wire like every other row, and `started_at` beside the id because an
  // opaque prompt id alone is not something a person can look up. The row for records that
  // named no prompt carries neither field - see `CostReportPromptRow`.
  it("carries one row per prompt, dated, and one undated row for records that named none", () => {
    const envelope = envelopeOf({
      records: [
        record({ turn_id: "a", prompt_id: "p-1", event_timestamp: "2026-08-18T09:00:00.000Z" }),
        record({ turn_id: "b", prompt_id: "p-1", event_timestamp: "2026-08-18T09:05:00.000Z" }),
        record({ turn_id: "c", event_timestamp: "2026-08-18T10:00:00.000Z" }),
      ],
    });

    expect(
      envelope.by_prompt.map((row) => [row.prompt, row.started_at, row.totals.requests])
    ).toEqual([
      ["p-1", "2026-08-18T09:00:00Z", 2],
      [undefined, undefined, 1],
    ]);
  });

  it("carries every day the period spans, a gap included, never sorted by size", () => {
    const envelope = envelopeOf({
      records: [
        record({ turn_id: "a", cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" }),
        record({ turn_id: "b", cost_usd: 5, event_timestamp: "2026-08-21T10:00:00Z" }),
      ],
    });

    expect(envelope.by_day.map((row) => row.day)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(envelope.by_day.find((row) => row.day === "2026-08-18")?.totals).toEqual({
      requests: 0,
    });
  });

  it("carries what the read could not place and could not parse", () => {
    expect(envelopeOf({ undatedRecords: 3, unreadableLines: 2 }).read).toEqual({
      undated_records: 3,
      unreadable_lines: 2,
    });
  });

  it("serializes an empty period to a valid object rather than to nothing", () => {
    const envelope = envelopeOf();

    expect(envelope.sessions).toBe(0);
    expect(envelope.totals.requests).toBe(0);
    expect(envelope.by_step).toEqual([]);
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("reads no clock and no filesystem", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/domain/models/cost-report-envelope.ts", import.meta.url)),
      "utf8"
    );

    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("Date");
  });
});

/** Extends the real output rather than standing in for it, so a widened double cannot stop
 * failing the day the class grows a method the printer starts calling. */
class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
}

describe("the two renderings are one computation", () => {
  const RECORDS: readonly TelemetrySinkRecord[] = [
    record({
      turn_id: "a",
      cost_usd: 1.5,
      input_tokens: 100,
      output_tokens: 20,
      cache_read_tokens: 880,
      model: "opus",
      step: "implement",
      step_attribution: "tool-stated",
    }),
    record({ turn_id: "b", cost_usd: 0.5, input_tokens: 10, model: "haiku" }),
  ];

  it("prints the figures the object carries, from the same report value", () => {
    const report = buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: RECORDS,
      journals: [],
      declaredTools: DECLARED,
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
    });
    const output = new CapturingOutput();
    printCostReport(output, report);
    const text = output.lines.join("\n");
    const envelope = toCostReportEnvelope(report);

    // Every headline figure, taken from the object and looked for in the text. A second
    // computation on either side would drift from the other exactly here.
    const tokens =
      (envelope.totals.input_tokens ?? 0) +
      (envelope.totals.output_tokens ?? 0) +
      (envelope.totals.cache_read_tokens ?? 0) +
      (envelope.totals.cache_creation_tokens ?? 0);
    expect(text).toContain(tokens.toLocaleString("en-US"));
    expect(text).toContain(`$${((envelope.totals.cost_micro_usd ?? 0) / 1e6).toFixed(2)}`);
    expect(text).toContain(String(envelope.sessions));
    for (const row of envelope.by_model) expect(text).toContain(row.model);
    for (const row of envelope.by_step) if (row.step) expect(text).toContain(row.step);
    for (const row of envelope.by_tool) if (row.reason) expect(text).toContain(row.reason);
  });

  it("takes the same value on both sides, so neither can see a figure the other cannot", () => {
    const printerSource = readFileSync(
      fileURLToPath(
        new URL("../../../src/application/display/cost-report-display.ts", import.meta.url)
      ),
      "utf8"
    );
    const envelopeSource = readFileSync(
      fileURLToPath(new URL("../../../src/domain/models/cost-report-envelope.ts", import.meta.url)),
      "utf8"
    );

    // Both take a CostReport and nothing else; neither reaches for records or a sink.
    for (const source of [printerSource, envelopeSource]) {
      expect(source).toContain("CostReport");
      expect(source).not.toContain("TelemetrySinkRecord");
      expect(source).not.toContain("buildCostReport");
    }
  });
});
