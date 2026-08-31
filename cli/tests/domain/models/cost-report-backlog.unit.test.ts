import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostTotals,
  toMicroUsd,
} from "../../../src/domain/models/cost-report.js";
import type { TaskBacklogDeclaration } from "../../../src/domain/models/task-backlog-link.js";
import type { TaskIdentity } from "../../../src/domain/models/task-identity.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

const BASE: TelemetrySinkRecord = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "local-read",
  tool: "claude",
  vendor_id: "s-multi",
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

// Four tasks declared in sequence by one session, each closed the moment the next opens -
// two declaring the same backlog item (the merge this axis exists for), one declaring
// none, one whose declaration could not be read. A fifth record precedes the first
// declaration, landing in the axis' own pass-through reason row.
const ITEM_TASK_A = "2026_08/item-task-a";
const ITEM_TASK_B = "2026_08/item-task-b";
const NONE_TASK = "2026_08/none-task";
const UNREADABLE_TASK = "2026_08/unreadable-task";
const BACKLOG_ITEM = "acme/repo#42";

const JOURNALS: readonly CostReportSessionJournal[] = [
  {
    vendorId: "s-multi",
    tool: "claude-code",
    writtenPaths: [],
    taskIntervals: [
      {
        path: `aidd_docs/tasks/${ITEM_TASK_A}/spec.md`,
        startMs: Date.parse("2026-08-17T10:00:00Z"),
        endMs: Date.parse("2026-08-17T11:00:00Z"),
      },
      {
        path: `aidd_docs/tasks/${ITEM_TASK_B}/spec.md`,
        startMs: Date.parse("2026-08-17T11:00:00Z"),
        endMs: Date.parse("2026-08-17T12:00:00Z"),
      },
      {
        path: `aidd_docs/tasks/${NONE_TASK}/spec.md`,
        startMs: Date.parse("2026-08-17T12:00:00Z"),
        endMs: Date.parse("2026-08-17T13:00:00Z"),
      },
      {
        path: `aidd_docs/tasks/${UNREADABLE_TASK}/spec.md`,
        startMs: Date.parse("2026-08-17T13:00:00Z"),
        endMs: Date.parse("2026-08-17T14:00:00Z"),
      },
    ],
  },
];

function linkTo(backlog: string): TaskBacklogDeclaration {
  return {
    kind: "declared",
    link: { backlog, writtenAt: "2026-08-17T09:00:00Z", writtenBy: "aidd-pm:04-spec" },
  };
}

const DECLARATIONS: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> = new Map([
  [ITEM_TASK_A, linkTo(BACKLOG_ITEM)],
  [ITEM_TASK_B, linkTo(BACKLOG_ITEM)],
  [NONE_TASK, { kind: "none" }],
  [UNREADABLE_TASK, { kind: "unreadable" }],
]);

const RECORDS: readonly TelemetrySinkRecord[] = [
  // Before any declaration - the axis' own reason row, unchanged from byTasks.
  request({ turn_id: "before", cost_usd: 1, event_timestamp: "2026-08-17T09:30:00Z" }),
  request({ turn_id: "item-a", cost_usd: 10, event_timestamp: "2026-08-17T10:30:00Z" }),
  request({ turn_id: "item-b", cost_usd: 5, event_timestamp: "2026-08-17T11:30:00Z" }),
  request({ turn_id: "none", cost_usd: 3, event_timestamp: "2026-08-17T12:30:00Z" }),
  request({ turn_id: "unreadable", cost_usd: 2, event_timestamp: "2026-08-17T13:30:00Z" }),
];

describe("buildCostReport — by_backlog regroups tasks by what their folder declares", () => {
  it("merges two tasks declaring the same item into one row", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });

    const named = built.byBacklog.filter((row) => row.backlog !== undefined);
    expect(named).toHaveLength(1);
    expect(named[0]?.backlog).toBe(BACKLOG_ITEM);
    expect(named[0]?.totals.requests).toBe(2);
    expect(named[0]?.totals.costMicroUsd).toBe(toMicroUsd(15));
  });

  it("gives a task declaring none its own row, distinct from a record in no task at all", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });

    const none = built.byBacklog.find((row) => row.declaration === "none");
    expect(none).toBeDefined();
    expect(none?.totals.requests).toBe(1);
    expect(none?.totals.costMicroUsd).toBe(toMicroUsd(3));
    expect(none?.reason).toBeUndefined();
  });

  it("gives a damaged declaration its own row, costing only its own resolution", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });

    const unreadable = built.byBacklog.find((row) => row.declaration === "unreadable");
    expect(unreadable).toBeDefined();
    expect(unreadable?.totals.requests).toBe(1);
    expect(unreadable?.totals.costMicroUsd).toBe(toMicroUsd(2));
  });

  it("carries a record in no task at all through as its own reason row, unchanged", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });

    const reasonRow = built.byBacklog.find((row) => row.reason !== undefined);
    expect(reasonRow?.reason).toBe("precedes-declaration");
    expect(reasonRow?.totals.requests).toBe(1);
    expect(reasonRow?.totals.costMicroUsd).toBe(toMicroUsd(1));
  });

  it("reconciles to the same total as the period, and as the task breakdown", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });
    const expected = { requests: built.totals.requests, costMicroUsd: built.totals.costMicroUsd };

    expect(sumOf(built.byBacklog)).toEqual(expected);
    expect(sumOf(built.byTasks)).toEqual(expected);
  });

  it("orders named items largest first, then none, then unreadable, then every reason", () => {
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });

    expect(built.byBacklog.map((row) => row.backlog ?? row.declaration ?? row.reason)).toEqual([
      BACKLOG_ITEM,
      "none",
      "unreadable",
      "precedes-declaration",
    ]);
  });

  it("a task with no entry in the resolved declarations still counts, defaulting to none rather than dropping the record", () => {
    // The map a report is actually handed always resolves every task identity its own
    // journals can name (ReportCostUseCase's job) - this proves the domain does not
    // silently lose a record's figures were that ever not true, the same defensive
    // default `declaredTaskKeyOf`'s own fallback documents.
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: new Map(),
    });

    expect(sumOf(built.byBacklog).requests).toBe(RECORDS.length);
    const none = built.byBacklog.find((row) => row.declaration === "none");
    expect(none?.totals.requests).toBe(4); // every declared-task record, none resolved
  });

  it("mutation proof: a task declaring no item is never silently merged into one that declared", () => {
    // Mutating the fixture to make the "none" task declare the same item the merge test
    // uses would move its record into the named row - the guard this test exists to prove
    // never happens on its own: the none row and the named row must stay disjoint unless a
    // declaration is actually changed.
    const built = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: DECLARATIONS,
    });
    const named = built.byBacklog.find((row) => row.backlog === BACKLOG_ITEM);
    const none = built.byBacklog.find((row) => row.declaration === "none");
    expect(named?.totals.requests).toBe(2);
    expect(none?.totals.requests).toBe(1);

    const mutatedDeclarations = new Map(DECLARATIONS);
    mutatedDeclarations.set(NONE_TASK, linkTo(BACKLOG_ITEM));
    const mutated = report({
      records: RECORDS,
      journals: JOURNALS,
      taskBacklogDeclarations: mutatedDeclarations,
    });
    const mutatedNamed = mutated.byBacklog.find((row) => row.backlog === BACKLOG_ITEM);
    expect(mutatedNamed?.totals.requests).toBe(3);
    expect(mutated.byBacklog.find((row) => row.declaration === "none")).toBeUndefined();
  });
});
