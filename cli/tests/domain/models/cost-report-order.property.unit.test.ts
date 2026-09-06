import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
} from "../../../src/domain/models/cost-report.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

/**
 * A re-read appends, so one session's lines sit in different orders on two machines, and
 * nothing a consumer does controls it. `cost-report.unit.test.ts` already reverses four
 * records; this covers what that fixture cannot.
 *
 * Every row kind added since is keyed differently from the others, and mixed key kinds in
 * one `Map` are exactly where insertion order leaks into output: `by_flow` keys an
 * interval-derived row on the `FlowInterval` object and a tool-stated one on the skill's
 * name, and `by_agent` keys two of its three rows on symbols. A report that ranks by size
 * then breaks ties on a row key cannot be allowed to answer differently because the records
 * arrived shuffled.
 *
 * Verified against the real thing before it was written: 30,222 records of a live sink,
 * shuffled within every day file, produced a byte-identical report. This is the guard for
 * it, over permutations rather than one reversal.
 */
const AT = "2026-08-18T10:00:00Z";
const LATER = "2026-08-18T11:30:00Z";

const NAMES_AGENTS = {
  localRead: { tokenCounters: true, amount: false, toolStatedStep: true, agentName: true },
  export: null,
  journalAttributable: true,
  taskAttributable: true,
} as const;

const NAMES_NO_AGENT = {
  localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

const DECLARED = [
  { tool: "claude", coverage: "covered", capability: NAMES_AGENTS },
  { tool: "codex", coverage: "covered", capability: NAMES_NO_AGENT },
] as const;

/** One session the journal witnessed, so an interval-derived flow row exists beside a
 * tool-stated one — the two key kinds this property is about. */
const JOURNALS: readonly CostReportSessionJournal[] = [
  {
    vendorId: "s-witnessed",
    tool: "claude-code",
    writtenPaths: [],
    taskIntervals: [],
    flowIntervals: [
      {
        skill: "aidd-orchestrator:01-sdlc",
        startMs: Date.parse("2026-08-18T09:00:00Z"),
        endMs: Date.parse("2026-08-18T10:30:00Z"),
        closedBy: "boundary",
      },
    ],
  },
];

function record(overrides: Partial<TelemetrySinkRecord>): TelemetrySinkRecord {
  return {
    sink_schema_version: 2,
    kind: "request",
    provenance: "local-read",
    tool: "claude",
    vendor_id: "s-witnessed",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
    event_timestamp: AT,
    cost_usd: 1,
    ...overrides,
  };
}

/** Every row kind the report can produce, once each: an interval-derived flow and a
 * tool-stated one, all three agent attributions, a named prompt and one that named none,
 * two models, two tools, and a pair with identical figures whose order only a tie-break can
 * decide. */
const RECORDS: readonly TelemetrySinkRecord[] = [
  // Inside the witnessed flow, agent named by the tool.
  record({ turn_id: "a", agent_name: "aidd-dev:executor", model: "opus", prompt_id: "p-1" }),
  // Inside the witnessed flow, no agent — the main thread, since claude names agents.
  record({ turn_id: "b", model: "haiku", prompt_id: "p-1" }),
  // Outside every interval, but the tool named an orchestrating skill: a tool-stated flow.
  record({
    turn_id: "c",
    vendor_id: "s-unwitnessed",
    event_timestamp: LATER,
    step_attribution: "tool-stated",
    step: "aidd-orchestrator:01-sdlc",
    model: "opus",
  }),
  record({
    turn_id: "d",
    vendor_id: "s-unwitnessed",
    event_timestamp: LATER,
    step_attribution: "tool-stated",
    step: "aidd-orchestrator:02-backlog",
    model: "haiku",
  }),
  // A tool that never names an agent: the third agent row, and it must not read as a main
  // thread however the records arrive.
  record({ turn_id: "e", tool: "codex", vendor_id: "s-codex", event_timestamp: LATER }),
  // Two rows with identical figures, so only the tie-break on the row's own key can order
  // them — the case repetition alone never catches.
  record({ turn_id: "f", model: "zulu", cost_usd: 3, prompt_id: "p-2" }),
  record({ turn_id: "g", model: "alpha", cost_usd: 3, prompt_id: "p-3" }),
  // One billed call two routes saw, with equal counters and different content: only
  // `pickDeterministically` can choose a survivor, and picking `group[0]` would make the
  // choice depend on which line the day file happened to list first.
  record({
    turn_id: "h",
    billed_request_id: "req-1",
    model: "opus",
    cost_usd: 4,
    input_tokens: 10,
    agent_name: "Explore",
  }),
  record({
    turn_id: "i",
    billed_request_id: "req-1",
    model: "opus",
    cost_usd: 4,
    input_tokens: 10,
    prompt_id: "p-4",
  }),
];

function reportOf(records: readonly TelemetrySinkRecord[]): string {
  const input: CostReportInput = {
    fromDay: "2026-08-17",
    toDay: "2026-08-21",
    records,
    journals: JOURNALS,
    declaredTools: DECLARED,
    undatedRecords: 0,
    unreadableLines: 0,
    measurementEnabled: true,
  };
  return JSON.stringify(buildCostReport(input));
}

describe("buildCostReport — every row kind, arriving in any order", () => {
  it("answers the same report for every permutation of the same records", () => {
    const expected = reportOf(RECORDS);

    fc.assert(
      fc.property(fc.shuffledSubarray([...RECORDS], { minLength: RECORDS.length }), (shuffled) => {
        expect(reportOf(shuffled)).toBe(expected);
      }),
      { numRuns: 300 }
    );
  });

  // The fixture has to actually exercise what the property is about: a permutation of records
  // that produce only one kind of row proves nothing about mixed keys.
  it("covers both flow row kinds and all three agent attributions", () => {
    const report = JSON.parse(reportOf(RECORDS)) as {
      byFlows: { attribution: string }[];
      byAgents: { attribution: string }[];
    };

    expect(new Set(report.byFlows.map((row) => row.attribution))).toEqual(
      new Set(["journal-interval", "tool-stated", "unattributed"])
    );
    expect(new Set(report.byAgents.map((row) => row.attribution))).toEqual(
      new Set(["tool-stated", "main-thread", "not-stated"])
    );
  });
});
