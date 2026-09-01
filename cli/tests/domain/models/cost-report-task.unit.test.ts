import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostTotals,
  toMicroUsd,
} from "../../../src/domain/models/cost-report.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

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
    measurementEnabled: true,
    ...overrides,
  });
}

function sumOf(rows: readonly { readonly totals: CostTotals }[]): CostTotals {
  return rows.reduce<CostTotals>(
    (accumulator, row) => ({
      requests: accumulator.requests + row.totals.requests,
      costMicroUsd: (accumulator.costMicroUsd ?? 0) + (row.totals.costMicroUsd ?? 0),
    }),
    { requests: 0, costMicroUsd: 0 }
  );
}

// One session that declares two tasks in sequence, closing the first the moment the
// second opens - the shape `buildTaskIntervals` produces from two `task_declared` lines
// with no `turn_end` between them. A record before the first declaration falls in
// neither.
const FIRST_TASK = "2026_08/first-task";
const SECOND_TASK = "2026_08/second-task";
const JOURNALS: readonly CostReportSessionJournal[] = [
  {
    vendorId: "s-two-tasks",
    tool: "claude-code",
    writtenPaths: [],
    taskIntervals: [
      {
        path: "aidd_docs/tasks/2026_08/first-task/spec.md",
        startMs: Date.parse("2026-08-17T10:00:00Z"),
        endMs: Date.parse("2026-08-17T11:00:00Z"),
      },
      {
        path: "aidd_docs/tasks/2026_08/second-task/spec.md",
        startMs: Date.parse("2026-08-17T11:00:00Z"),
        endMs: Date.parse("2026-08-17T12:00:00Z"),
      },
    ],
    flowIntervals: [],
  },
];
const RECORDS: readonly TelemetrySinkRecord[] = [
  // Before any declaration - belongs to no task.
  request({
    vendor_id: "s-two-tasks",
    turn_id: "before",
    cost_usd: 1,
    event_timestamp: "2026-08-17T09:00:00Z",
  }),
  request({
    vendor_id: "s-two-tasks",
    turn_id: "first",
    cost_usd: 2,
    event_timestamp: "2026-08-17T10:30:00Z",
  }),
  request({
    vendor_id: "s-two-tasks",
    turn_id: "second",
    cost_usd: 4,
    event_timestamp: "2026-08-17T11:30:00Z",
  }),
];

describe("buildCostReport — by_task groups by the declared interval a record falls in", () => {
  it("gives one row per task declared in the period", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    const named = built.byTasks.filter((row) => row.task !== undefined);
    expect(named.map((row) => row.task)).toEqual([SECOND_TASK, FIRST_TASK]);
  });

  it("carries the attribution a closed interval always rests on", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    for (const row of built.byTasks.filter((row) => row.task !== undefined)) {
      expect(row.attribution).toBe("declared");
    }
  });

  it("places a record before any declaration in its own row, never dropped", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    const noTask = built.byTasks.find((row) => row.task === undefined);
    expect(noTask).toBeDefined();
    expect(noTask?.totals.requests).toBe(1);
    expect(noTask?.totals.costMicroUsd).toBe(toMicroUsd(1));
    expect(noTask?.attribution).toBeUndefined();
  });

  it("counts each record once, in exactly one row, when a session declares twice", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    expect(sumOf(built.byTasks).requests).toBe(RECORDS.length);
  });

  it("sums the task rows back to the same period total as every other breakdown", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });
    const expected = { requests: built.totals.requests, costMicroUsd: built.totals.costMicroUsd };

    expect(sumOf(built.byTasks)).toEqual(expected);
    expect(sumOf(built.byModels)).toEqual(expected);
    expect(sumOf(built.byProjects)).toEqual(expected);
  });

  it("sorts named tasks largest first, with the no-task row placed last regardless of size", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });

    expect(built.byTasks.map((row) => row.task)).toEqual([SECOND_TASK, FIRST_TASK, undefined]);
  });

  it("holds everything in the no-task row when nothing was ever declared, and still reconciles", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-silent",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-silent", cost_usd: 5, event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
    expect(built.byTasks[0]?.totals.requests).toBe(1);
    expect(sumOf(built.byTasks).requests).toBe(built.totals.requests);
  });

  it("never lets the whole-session written-path inference the --task filter uses leak into this breakdown", () => {
    // A session that wrote into a task folder, but never declared - the --task filter's
    // own "inferred" route would attribute the whole session to it; this breakdown does
    // not consult written paths at all, so the record lands in the no-task row.
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-written-only",
        tool: "claude-code",
        writtenPaths: ["aidd_docs/tasks/2026_08/first-task/plan.md"],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-written-only",
        cost_usd: 3,
        event_timestamp: "2026-08-17T10:00:00Z",
      }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
  });

  it("never contradicts a --task header: the inferred route's own record still names no declared interval", () => {
    // A session that wrote into first-task's folder but never declared an interval - the
    // --task filter's own "inferred" route keeps this record in scope (report.task is
    // set), but by_task does not read that route, so the record still lands in the row
    // with no `task`. That row must never be read as "this session touched no task" -
    // see cost-report-contract.md's own note on this interaction.
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-inferred-only",
        tool: "claude-code",
        writtenPaths: ["aidd_docs/tasks/2026_08/first-task/plan.md"],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-inferred-only",
        cost_usd: 6,
        event_timestamp: "2026-08-17T10:00:00Z",
      }),
    ];

    const built = report({ records, journals, task: "2026_08/first-task" });

    expect(built.task).toBe("2026_08/first-task");
    expect(built.totals.requests).toBe(1);
    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
    expect(built.byTasks[0]?.totals.requests).toBe(1);
    expect(sumOf(built.byTasks).requests).toBe(built.totals.requests);
  });

  it("resolves a declared interval whose path merely contains '..' as text, never misreading live coverage as journal-silent", () => {
    // The hook's own gate for a declared path (task-declared.cjs) allows "..' inside a
    // folder name - "2026_02_10_a..b" is a name, not a climb - and used to be rejected by
    // a blanket substring check here, which then fell through to `journal-silent` for a
    // record squarely inside the declared, still-open interval. That is a false claim
    // about the journal's own timing, not about the path.
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-dotted-name",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [
          {
            path: "aidd_docs/tasks/2026_02/2026_02_10_a..b/spec.md",
            startMs: Date.parse("2026-02-10T09:10:00Z"),
            endMs: Date.parse("2026-02-10T09:40:00Z"),
          },
        ],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-dotted-name",
        cost_usd: 2,
        event_timestamp: "2026-02-10T09:20:00Z",
      }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBe("2026_02/2026_02_10_a..b");
    expect(built.byTasks[0]?.reason).toBeUndefined();
  });

  it("answers all six questions over one period, each reconciling to the same total", () => {
    const built = report({ records: RECORDS, journals: JOURNALS });
    const expected = { requests: built.totals.requests, costMicroUsd: built.totals.costMicroUsd };

    expect(sumOf(built.byModels)).toEqual(expected);
    expect(sumOf(built.byTasks)).toEqual(expected);
    expect(sumOf(built.bySteps)).toEqual(expected);
    expect(sumOf(built.byPeople)).toEqual(expected);
    expect(sumOf(built.byProjects)).toEqual(expected);
  });
});
