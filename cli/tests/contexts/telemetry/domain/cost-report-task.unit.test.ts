import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostTotals,
  toMicroUsd,
} from "../../../../src/contexts/telemetry/domain/cost-report.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";

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
// second opens. A record before the first declaration falls in neither.
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

  // A session whose journal was read and declared nothing is a fact about the work; a
  // session with no journal at all is a fact about the read. One name for both is a zero.
  it("says no journal was read, rather than that the session declared nothing", () => {
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-unjournalled", event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals: [] });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
    expect(built.byTasks[0]?.reason).toBe("no-journal");
    expect(sumOf(built.byTasks).requests).toBe(built.totals.requests);
  });

  it("still says the session declared nothing when its journal was read and held no declaration", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-read-but-silent",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-read-but-silent", event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks[0]?.reason).toBe("no-declaration");
  });

  // The backlog axis keys off `by_task`'s own row key, so an unread journal must not arrive
  // there as a task that declared no backlog item either.
  it("carries the unread journal through to the backlog axis unchanged", () => {
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-unjournalled", event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals: [] });

    expect(built.byBacklog).toHaveLength(1);
    expect(built.byBacklog[0]?.reason).toBe("no-journal");
  });

  // A session bills records before its flow names a ticket. Where it wrote into exactly one
  // task folder those have an answer, marked `inferred`, never merged into the declared row.
  it("names a record no declaration covers after the only task folder the session wrote into", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-one-folder",
        tool: "claude-code",
        writtenPaths: ["aidd_docs/tasks/2026_08/first-task/plan.md"],
        taskIntervals: [
          {
            path: "aidd_docs/tasks/2026_08/first-task/plan.md",
            startMs: Date.parse("2026-08-17T11:00:00Z"),
            endMs: Date.parse("2026-08-17T12:00:00Z"),
          },
        ],
        flowIntervals: [],
        witnessed: {
          fromMs: Date.parse("2026-08-17T09:00:00Z"),
          toMs: Date.parse("2026-08-17T12:00:00Z"),
        },
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-one-folder", event_timestamp: "2026-08-17T10:00:00Z" }),
      request({ vendor_id: "s-one-folder", event_timestamp: "2026-08-17T11:30:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toEqual([
      { task: FIRST_TASK, attribution: "declared", totals: expect.anything() },
      { task: FIRST_TASK, attribution: "inferred", totals: expect.anything() },
    ]);
    expect(sumOf(built.byTasks).requests).toBe(built.totals.requests);
  });

  // Two candidates and no reason to choose between them: one session placed under two task
  // rows at once is answered by refusing, never by picking the first.
  it("infers nothing for a session that wrote into two task folders", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-two-folders",
        tool: "claude-code",
        writtenPaths: [
          "aidd_docs/tasks/2026_08/first-task/plan.md",
          "aidd_docs/tasks/2026_08/second-task/plan.md",
        ],
        taskIntervals: [],
        flowIntervals: [],
        witnessed: {
          fromMs: Date.parse("2026-08-17T09:00:00Z"),
          toMs: Date.parse("2026-08-17T12:00:00Z"),
        },
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-two-folders", event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
    expect(built.byTasks[0]?.reason).toBe("no-declaration");
  });

  // A session whose journal was lost and recreated witnesses only the time since: its earlier
  // records are in the sink, and attributing them to a folder it touched today is false.
  it("infers nothing for a record outside the span its journal actually witnessed", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-short-journal",
        tool: "claude-code",
        writtenPaths: ["aidd_docs/tasks/2026_08/first-task/plan.md"],
        taskIntervals: [],
        flowIntervals: [],
        witnessed: {
          fromMs: Date.parse("2026-08-21T09:00:00Z"),
          toMs: Date.parse("2026-08-21T12:00:00Z"),
        },
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-short-journal", event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toHaveLength(1);
    expect(built.byTasks[0]?.task).toBeUndefined();
    expect(built.byTasks[0]?.reason).toBe("precedes-journal");
  });

  // A resumed transcript hands over turns billed days before its journal opened, and the same
  // session then declares a task: both records are unattributed, for two different reasons.
  it("separates a record older than its journal from one that merely preceded a declaration", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-resumed",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [
          {
            path: "aidd_docs/tasks/2026_08/first-task/plan.md",
            startMs: Date.parse("2026-08-21T10:00:00Z"),
            endMs: Date.parse("2026-08-21T12:00:00Z"),
          },
        ],
        flowIntervals: [],
        witnessed: {
          fromMs: Date.parse("2026-08-21T09:00:00Z"),
          toMs: Date.parse("2026-08-21T12:00:00Z"),
        },
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-resumed", event_timestamp: "2026-08-17T10:00:00Z" }),
      request({ vendor_id: "s-resumed", event_timestamp: "2026-08-21T09:30:00Z" }),
      request({ vendor_id: "s-resumed", event_timestamp: "2026-08-21T11:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byTasks).toEqual([
      { task: FIRST_TASK, attribution: "declared", totals: expect.anything() },
      { reason: "precedes-journal", totals: expect.anything() },
      { reason: "precedes-declaration", totals: expect.anything() },
    ]);
    expect(sumOf(built.byTasks).requests).toBe(built.totals.requests);
  });

  it("never lets the whole-session written-path inference the --task filter uses leak into this breakdown", () => {
    // A session that wrote into a task folder but never declared - this breakdown does not
    // consult written paths at all, so the record lands in the no-task row.
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
    // The --task filter's own "inferred" route keeps this record in scope, but by_task does
    // not read that route: its no-`task` row is never "this session touched no task".
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
    // A declared path may hold ".." as text - "2026_02_10_a..b" is a name, not a climb - and a
    // blanket substring check falls through to `journal-silent` for a live, open interval.
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
