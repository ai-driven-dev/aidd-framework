import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostTotals,
  toMicroUsd,
} from "../../../src/domain/models/cost-report.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../src/domain/models/tool-ids.js";

const BASE: TelemetrySinkRecord = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "local-read",
  tool: "claude",
  vendor_id: "s-1",
  vendor_field: "sessionId",
  step_attribution: "unattributed",
};

function request(overrides: Partial<TelemetrySinkRecord> = {}): TelemetrySinkRecord {
  return { ...BASE, ...overrides };
}

function sessionMeasure(overrides: Partial<TelemetrySinkRecord> = {}): TelemetrySinkRecord {
  return { ...BASE, kind: "session", ...overrides };
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

function report(overrides: Partial<CostReportInput> = {}) {
  return buildCostReport({
    fromDay: "2026-08-17",
    toDay: "2026-08-21",
    records: [],
    journals: [],
    declaredTools: [{ tool: "claude", coverage: "covered", capability: NO_CAPABILITY }],
    undatedRecords: 0,
    unreadableLines: 0,
    ...overrides,
  });
}

function sumOf(rows: readonly { readonly totals: CostTotals }[]): CostTotals {
  return rows.reduce<CostTotals>(
    (accumulator, row) => ({
      requests: accumulator.requests + row.totals.requests,
      costMicroUsd: (accumulator.costMicroUsd ?? 0) + (row.totals.costMicroUsd ?? 0),
      inputTokens: (accumulator.inputTokens ?? 0) + (row.totals.inputTokens ?? 0),
      outputTokens: (accumulator.outputTokens ?? 0) + (row.totals.outputTokens ?? 0),
    }),
    { requests: 0, costMicroUsd: 0, inputTokens: 0, outputTokens: 0 }
  );
}

describe("buildCostReport — the two kinds are never summed", () => {
  it("takes money and tokens from request records alone", () => {
    // The same session's cost, present on both kinds. The metric line is one flush window's
    // own delta; adding it to the request lines counts part of the session twice.
    const built = report({
      records: [
        request({ cost_usd: 0.16, input_tokens: 100, output_tokens: 10 }),
        sessionMeasure({ cost_usd: 0.0151, input_tokens: 7 }),
      ],
    });

    expect(built.totals.costMicroUsd).toBe(toMicroUsd(0.16));
    expect(built.totals.inputTokens).toBe(100);
    expect(built.totals.requests).toBe(1);
  });

  it("takes active time from session records alone, and never breaks it down by step", () => {
    const built = report({
      records: [
        request({ step: "aidd-dev:02-implement", step_attribution: "tool-stated", cost_usd: 1 }),
        sessionMeasure({ active_time_s: 47 }),
      ],
    });

    expect(built.activeTimeSeconds).toBe(47);
    // No active-time measure on any tool carries a step attribute, so a per-step share
    // could only ever be cost. The step rows carry no time field at all.
    expect(JSON.stringify(built.bySteps)).not.toContain("active");
  });

  it("reports no active time at all, rather than zero, when no record carried it", () => {
    expect(report({ records: [request({ cost_usd: 1 })] }).activeTimeSeconds).toBeUndefined();
  });
});

describe("buildCostReport — an absent quantity stays absent", () => {
  it("reports no amount for a tool whose records carry none, never a zero", () => {
    const built = report({
      records: [request({ tool: "codex", input_tokens: 8898, output_tokens: 827 })],
      declaredTools: [{ tool: "codex", coverage: "covered", capability: NO_CAPABILITY }],
    });

    expect(built.totals.costMicroUsd).toBeUndefined();
    expect(built.byTools[0]?.totals.costMicroUsd).toBeUndefined();
    expect(built.byTools[0]?.totals.inputTokens).toBe(8898);
  });

  it("keeps a counter observed as zero distinct from one never observed", () => {
    const built = report({ records: [request({ input_tokens: 0 })] });

    expect(built.totals.inputTokens).toBe(0);
    expect(built.totals.outputTokens).toBeUndefined();
  });

  it("gives a covered tool that did nothing a row of its own, not silence", () => {
    const built = report({
      records: [request({ tool: "claude", cost_usd: 1 })],
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
    });

    expect(built.byTools.map((row) => [row.tool, row.coverage, row.totals.requests])).toEqual([
      ["claude", "covered", 1],
      ["codex", "covered", 0],
      ["cursor", "not-covered", 0],
    ]);
    expect(built.byTools[2]?.reason).toBe("It writes no token count.");
  });
});

describe("buildCostReport — every breakdown reconciles", () => {
  const RECORDS: readonly TelemetrySinkRecord[] = [
    request({
      turn_id: "a",
      cost_usd: 0.1,
      input_tokens: 10,
      output_tokens: 1,
      model: "opus",
      step: "aidd-dev:02-implement",
      step_attribution: "tool-stated",
    }),
    request({
      turn_id: "b",
      cost_usd: 0.02,
      input_tokens: 20,
      output_tokens: 2,
      model: "opus",
      step: "aidd-dev:02-implement",
      step_attribution: "journal-interval",
    }),
    request({
      turn_id: "c",
      cost_usd: 0.003,
      input_tokens: 30,
      output_tokens: 3,
      model: "haiku",
      step: "aidd-dev:05-review",
      step_attribution: "tool-stated",
    }),
    request({ turn_id: "d", cost_usd: 0.0004, input_tokens: 40, output_tokens: 4, model: "haiku" }),
  ];

  it("sums each breakdown exactly back to the total it belongs to", () => {
    const built = report({ records: RECORDS });
    const expected = {
      requests: 4,
      costMicroUsd: toMicroUsd(0.1) + toMicroUsd(0.02) + toMicroUsd(0.003) + toMicroUsd(0.0004),
      inputTokens: 100,
      outputTokens: 10,
    };

    expect(built.totals).toMatchObject(expected);
    for (const rows of [built.bySteps, built.byModels, built.attributionMix]) {
      expect(sumOf(rows)).toEqual(expected);
    }
  });

  it("splits the total three ways by how strongly each part was attributed", () => {
    const built = report({ records: RECORDS });
    expect(built.attributionMix.map((row) => [row.attribution, row.totals.requests])).toEqual([
      ["tool-stated", 2],
      ["journal-interval", 1],
      ["unattributed", 1],
    ]);
  });

  it("keeps one skill reached both ways as two rows, never merged into one claim", () => {
    const built = report({ records: RECORDS });
    const implement = built.bySteps.filter((row) => row.step === "aidd-dev:02-implement");

    expect(implement.map((row) => row.attribution).sort()).toEqual([
      "journal-interval",
      "tool-stated",
    ]);
  });

  it("names what nothing could attribute as unattributed, with no step of its own", () => {
    const built = report({ records: RECORDS });
    const rows = built.bySteps.filter((row) => row.attribution === "unattributed");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.step).toBeUndefined();
    // Never a residual, and never a claim that the work ran outside every step.
    expect(JSON.stringify(built.bySteps)).not.toContain("residual");
  });

  it("orders each breakdown largest first, so the biggest thing is read first", () => {
    const built = report({ records: RECORDS });

    expect(built.byModels.map((row) => row.model)).toEqual(["opus", "haiku"]);
    expect(built.bySteps[0]?.step).toBe("aidd-dev:02-implement");
  });

  it("orders by tokens where no amount exists, so an amount-less tool is not sorted as free", () => {
    const built = report({
      records: [
        request({ turn_id: "small", model: "small", input_tokens: 1, output_tokens: 1 }),
        request({ turn_id: "big", model: "big", input_tokens: 900, output_tokens: 100 }),
      ],
    });

    expect(built.byModels.map((row) => row.model)).toEqual(["big", "small"]);
  });
});

// The default period is 2026-08-17..2026-08-21, five UTC days inclusive.
describe("buildCostReport — by day and by project", () => {
  it("gives every day in the period a row, a gap included, and reconciles to the total", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" }),
        request({ turn_id: "b", cost_usd: 3, event_timestamp: "2026-08-19T10:00:00Z" }),
      ],
    });

    expect(built.byDays.map((row) => row.day)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    const gap = built.byDays.find((row) => row.day === "2026-08-18");
    expect(gap?.totals).toEqual({ requests: 0 });

    const total = built.byDays.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    expect(total).toBe(built.totals.costMicroUsd);
  });

  it("gives a record with no project its own row, named as unknown", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 2, project_id: "acme/widgets" }),
        request({ turn_id: "b", cost_usd: 1 }),
      ],
    });

    expect(built.byProjects).toHaveLength(2);
    const unknown = built.byProjects.find((row) => row.project === undefined);
    expect(unknown?.totals.requests).toBe(1);
    expect(unknown?.totals.costMicroUsd).toBe(toMicroUsd(1));

    const total = built.byProjects.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    expect(total).toBe(built.totals.costMicroUsd);
  });

  it("never folds a record with no project into a neighbour's row", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" }),
        request({ turn_id: "b", cost_usd: 1 }),
      ],
    });
    const widgets = built.byProjects.find((row) => row.project === "acme/widgets");

    expect(widgets?.totals.requests).toBe(1);
  });
});

describe("buildCostReport — a task is a filter over a period", () => {
  const JOURNALS: readonly CostReportSessionJournal[] = [
    {
      vendorId: "s-task",
      tool: "claude-code",
      writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md"],
    },
    { vendorId: "s-other", tool: "claude-code", writtenPaths: ["cli/src/index.ts"] },
  ];
  const RECORDS: readonly TelemetrySinkRecord[] = [
    request({ vendor_id: "s-task", cost_usd: 1 }),
    request({ vendor_id: "s-other", cost_usd: 2 }),
    request({ vendor_id: "s-unjournalled", cost_usd: 4 }),
  ];

  it("counts only the sessions that wrote into the task asked for", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      task: "2026_08/2026_08_21_cost-reporter",
    });

    expect(built.totals.costMicroUsd).toBe(toMicroUsd(1));
    expect(built.sessions).toBe(1);
    expect(built.task).toBe("2026_08/2026_08_21_cost-reporter");
  });

  it("counts every session when no task is asked for, journalled or not", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    expect(built.totals.costMicroUsd).toBe(toMicroUsd(7));
    expect(built.sessions).toBe(3);
    expect(built.task).toBeUndefined();
  });

  it("attaches a session that wrote into no task folder to no task at all", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      task: "2026_08/some-other-task",
    });

    expect(built.totals.requests).toBe(0);
  });

  it("counts a session with no journal in the period, unattributed to any task", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    expect(built.totals.requests).toBe(3);
  });
});

describe("buildCostReport — what it says about itself", () => {
  it("carries the undated and unreadable counts through to the caller", () => {
    const built = report({ undatedRecords: 4, unreadableLines: 2 });

    expect(built.undatedRecords).toBe(4);
    expect(built.unreadableLines).toBe(2);
  });

  it("answers an empty period with an empty report, never an error", () => {
    const built = report();

    expect(built.sessions).toBe(0);
    expect(built.totals).toEqual({ requests: 0 });
    expect(built.bySteps).toEqual([]);
    expect(built.byModels).toEqual([]);
    // Three rows even here: the total is known to be nothing, and none of it came from
    // any source. That is a measurement, not an absence.
    expect(built.attributionMix.map((row) => [row.attribution, row.totals.requests])).toEqual([
      ["tool-stated", 0],
      ["journal-interval", 0],
      ["unattributed", 0],
    ]);
  });

  it("names no tool and no skill, by string literal", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/domain/models/cost-report.ts", import.meta.url)),
      "utf8"
    );

    for (const toolId of AI_TOOL_IDS) {
      expect(source).not.toContain(`"${toolId}"`);
      expect(source).not.toContain(`'${toolId}'`);
    }
    expect(source).not.toContain("aidd-dev:");
  });
});

describe("buildCostReport — the same records, however they arrive", () => {
  // A re-read appends, so the same session's lines sit in different orders on two
  // machines, and nothing a consumer does controls it. Repetition alone would never catch
  // a group that carries insertion order.
  const RECORDS: readonly TelemetrySinkRecord[] = [
    request({
      turn_id: "a",
      cost_usd: 1,
      model: "opus",
      step: "implement",
      step_attribution: "tool-stated",
    }),
    request({
      turn_id: "b",
      cost_usd: 1,
      model: "haiku",
      step: "review",
      step_attribution: "journal-interval",
    }),
    request({ turn_id: "c", cost_usd: 2, model: "sonnet", tool: "codex" }),
    sessionMeasure({ active_time_s: 12 }),
  ];

  const DECLARED = [
    { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
    { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
  ] as const;

  it("produces a byte-identical report from the records reversed", () => {
    const forwards = report({ records: RECORDS, declaredTools: DECLARED });
    const backwards = report({ records: [...RECORDS].reverse(), declaredTools: DECLARED });

    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards));
  });

  it("produces a byte-identical report twice from the same records", () => {
    expect(JSON.stringify(report({ records: RECORDS, declaredTools: DECLARED }))).toBe(
      JSON.stringify(report({ records: RECORDS, declaredTools: DECLARED }))
    );
  });

  it("keeps the same order when two rows carry equal weight", () => {
    // Two models, identical figures: only the tie-break on the row's own key can decide,
    // and it has to decide the same way whichever order they arrived in.
    const tied: readonly TelemetrySinkRecord[] = [
      request({ turn_id: "x", cost_usd: 1, model: "zulu" }),
      request({ turn_id: "y", cost_usd: 1, model: "alpha" }),
    ];

    const forwards = report({ records: tied }).byModels.map((row) => row.model);
    const backwards = report({ records: [...tied].reverse() }).byModels.map((row) => row.model);

    expect(forwards).toEqual(["alpha", "zulu"]);
    expect(backwards).toEqual(forwards);
  });
});
