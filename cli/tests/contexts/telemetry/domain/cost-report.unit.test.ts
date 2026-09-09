import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostTotals,
  toMicroUsd,
} from "../../../../src/contexts/telemetry/domain/cost-report.js";
import {
  parseTelemetrySinkLine,
  type TelemetrySinkRecord,
} from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../../src/kernel/tool.js";

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

/** The minimum the type requires; what a tool can really supply is not what these tests
 * are about. */
const NO_CAPABILITY = {
  localRead: null,
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

/** A tool whose local read does name the agent that ran - what tells "the main thread"
 * apart from "a tool that could never have said". */
const NAMES_AGENTS = {
  localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: true },
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

/** Codex's real shape: a declared local read that supplies token counters and names no
 * agent. Only a route that says `agentName` can support a main thread. */
const READS_BUT_NAMES_NO_AGENT = {
  localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

const TOOL_THAT_NAMES_AGENTS = [
  { tool: "claude" as const, coverage: "covered" as const, capability: NAMES_AGENTS },
];

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

// Both routes stored the same three billed calls: the export half carries the money, the
// local half a tool-stated step, and both carry the same `billed_request_id`.
describe("buildCostReport — one billed call, seen by both routes, counts once", () => {
  function exportedApiRequests(): readonly TelemetrySinkRecord[] {
    return [
      {
        sink_schema_version: 2,
        kind: "request",
        provenance: "export",
        tool: "claude",
        vendor_id: "7c53f826-fc3e-4729-8e2b-2cba887d3926",
        vendor_field: "session.id",
        turn_id: "a4b7b0b6-dc16-4889-b25a-def1d207aec9",
        turn_field: "prompt.id",
        step_attribution: "unattributed",
        project_id: "aidd-lab/telemetry-proof",
        billed_request_id: "req_011CeAaRe8Mm7oS7xvfjDPw8",
        cost_usd: 0.013220099999999999,
        input_tokens: 2,
        output_tokens: 4,
        cache_read_tokens: 43847,
        cache_creation_tokens: 0,
        model: "claude-sonnet-5",
        event_timestamp: "2026-08-18T17:04:39.258Z",
      },
      {
        sink_schema_version: 2,
        kind: "request",
        provenance: "export",
        tool: "claude",
        vendor_id: "22177147-d8cb-4ee1-976f-0ef82bd62491",
        vendor_field: "session.id",
        turn_id: "a7294fac-94af-4c32-b02d-d4c9a6d6edaa",
        turn_field: "prompt.id",
        step_attribution: "unattributed",
        billed_request_id: "req_011CeBjuapGBsHnPVLStybgB",
        cost_usd: 0.10862279999999999,
        input_tokens: 2,
        output_tokens: 157,
        cache_read_tokens: 27506,
        cache_creation_tokens: 16335,
        model: "claude-sonnet-5",
        event_timestamp: "2026-08-19T07:49:37.014Z",
      },
      {
        sink_schema_version: 2,
        kind: "request",
        provenance: "export",
        tool: "claude",
        vendor_id: "22177147-d8cb-4ee1-976f-0ef82bd62491",
        vendor_field: "session.id",
        turn_id: "a7294fac-94af-4c32-b02d-d4c9a6d6edaa",
        turn_field: "prompt.id",
        step_attribution: "unattributed",
        billed_request_id: "req_011CeBjux2xeafVaiUX646Qz",
        cost_usd: 0.05190105,
        input_tokens: 2,
        output_tokens: 4,
        cache_read_tokens: 14096,
        cache_creation_tokens: 12695,
        model: "claude-sonnet-5",
        event_timestamp: "2026-08-19T07:49:40.427Z",
      },
    ];
  }

  function localCounterpartOf(exported: TelemetrySinkRecord): TelemetrySinkRecord {
    return {
      sink_schema_version: exported.sink_schema_version,
      kind: "request",
      provenance: "local-read",
      tool: exported.tool,
      vendor_id: exported.vendor_id,
      vendor_field: "sessionId",
      turn_id: exported.billed_request_id,
      turn_field: "requestId",
      billed_request_id: exported.billed_request_id,
      step_attribution: "tool-stated",
      step: "aidd-dev:02-implement",
      input_tokens: exported.input_tokens,
      output_tokens: exported.output_tokens,
      cache_read_tokens: exported.cache_read_tokens,
      cache_creation_tokens: exported.cache_creation_tokens,
      model: exported.model,
      event_timestamp: exported.event_timestamp,
    };
  }

  it("sums a naive union of both routes' records to double — the reproduced defect", () => {
    const exported = exportedApiRequests();
    expect(exported).toHaveLength(3);
    expect(exported.every((r) => r.billed_request_id !== undefined)).toBe(true);
    const local = exported.map(localCounterpartOf);

    // What a naive reader gets by concatenating every route's records with no collapse:
    // six request lines for three real billed calls — money and tokens read double.
    const naiveUnion = [...exported, ...local];
    expect(naiveUnion).toHaveLength(6);
    const naiveInputTokens = naiveUnion.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0);
    expect(naiveInputTokens).toBe(12);
  });

  it("collapses the two routes' records for the same call into one, in the built report", () => {
    const exported = exportedApiRequests();
    const local = exported.map(localCounterpartOf);
    const trueCostMicroUsd = exported.reduce((sum, r) => sum + toMicroUsd(r.cost_usd ?? 0), 0);
    const trueInputTokens = exported.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0);
    const trueOutputTokens = exported.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0);
    const trueCacheReadTokens = exported.reduce((sum, r) => sum + (r.cache_read_tokens ?? 0), 0);

    const union = [...exported, ...local];
    const built = report({ records: union });

    // One billed call, counted once, whichever route or routes saw it — never the naive
    // union's six, and never the true figures doubled.
    expect(built.totals.requests).toBe(3);
    expect(trueInputTokens).toBe(6);
    expect(built.totals.costMicroUsd).toBe(trueCostMicroUsd);
    expect(built.totals.inputTokens).toBe(trueInputTokens);
    expect(built.totals.outputTokens).toBe(trueOutputTokens);
    expect(built.totals.cacheReadTokens).toBe(trueCacheReadTokens);

    // Neither route's own strength is thrown away for the other's: the export's money
    // survives, and so does the local read's tool-stated step.
    const toolStated = built.attributionMix.find((row) => row.attribution === "tool-stated");
    expect(toolStated?.totals.requests).toBe(3);
    expect(toolStated?.totals.costMicroUsd).toBe(trueCostMicroUsd);

    // Order-independent: a re-read's line order is never something a consumer controls,
    // and neither is which of two duplicate deliveries for one billed call arrives first.
    const reversed = report({ records: [...union].reverse() });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(built));
  });
});

// A Codex turn read while it was still open, then read again once more of it had arrived:
// two local-read request lines sharing one turn_id, neither an edit of the other.
describe("buildCostReport — a still-open local-read turn is superseded, never doubled", () => {
  const partial = request({
    turn_id: "turn-1",
    input_tokens: 2816,
    output_tokens: 1401,
    cache_read_tokens: 48896,
    cache_creation_tokens: 0,
  });
  const complete = request({
    turn_id: "turn-1",
    input_tokens: 5032,
    output_tokens: 3550,
    cache_read_tokens: 99840,
    cache_creation_tokens: 0,
  });

  it("keeps the larger reading, and does not sum the two into a figure neither reported", () => {
    const built = report({ records: [partial, complete] });

    // One request, not two — a naive union would double-count a turn read twice.
    expect(built.totals.requests).toBe(1);
    // The complete reading's own figures, never partial + complete summed (which would
    // read 7848/4951/148736/0 — a combination the tool's file never actually reported).
    expect(built.totals.inputTokens).toBe(5032);
    expect(built.totals.outputTokens).toBe(3550);
    expect(built.totals.cacheReadTokens).toBe(99840);
  });

  it("answers the same whichever order the two readings arrive in", () => {
    const forward = report({ records: [partial, complete] });
    const backward = report({ records: [complete, partial] });

    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });

  it("never lets a smaller reading of the same turn win, in either arrival order", () => {
    const built = report({ records: [complete, partial] });

    expect(built.totals.cacheReadTokens).toBe(99840);
    expect(built.totals.outputTokens).toBe(3550);
  });

  it("never collapses the export route's own turn_id, which several billed calls share", () => {
    // prompt.id-shaped: a main-agent request and a subagent request under one turn_id,
    // each its own billed call — collapsing here would merge two real calls into one.
    const mainAgent = request({
      provenance: "export",
      turn_id: "prompt-1",
      input_tokens: 100,
      output_tokens: 10,
    });
    const subagent = request({
      provenance: "export",
      turn_id: "prompt-1",
      input_tokens: 40,
      output_tokens: 5,
    });

    const built = report({ records: [mainAgent, subagent] });

    expect(built.totals.requests).toBe(2);
    expect(built.totals.inputTokens).toBe(140);
    expect(built.totals.outputTokens).toBe(15);
  });

  it("never collapses a kind: 'session' record sharing a turn_id (Copilot's shutdown total)", () => {
    // Copilot's own session-kind record is keyed on the shutdown event's own id, matched
    // like any turn_id — but it is a one-shot cumulative total, never a corrigible turn.
    const first = sessionMeasure({ turn_id: "shutdown-1", cache_read_tokens: 5 });
    const second = sessionMeasure({ turn_id: "shutdown-1", cache_read_tokens: 7 });

    const built = report({ records: [first, second] });

    const claude = built.byTools.find((row) => row.tool === "claude");
    // Both counted, exactly as any two `kind: "session"` datapoints would be — proof
    // nothing here diverted them into the turn-supersede path.
    expect(claude?.sessionTotals?.cacheReadTokens).toBe(12);
  });

  it("prefers an observed zero over an unmentioned counter when two readings tie on weight", () => {
    // Two readings of one turn tie on `counterWeight`, since a zero weighs nothing either
    // way; `model` is set so the plain sort favours the reading the tie-break must reject.
    const missesTheCounter = request({
      turn_id: "turn-2",
      model: "aaa",
      input_tokens: 100,
      output_tokens: 10,
      cache_read_tokens: 5,
      // cache_creation_tokens intentionally absent — never observed by this reading.
    });
    const statesItAsZero = request({
      turn_id: "turn-2",
      model: "zzz",
      input_tokens: 100,
      output_tokens: 10,
      cache_read_tokens: 5,
      cache_creation_tokens: 0,
    });

    const built = report({ records: [missesTheCounter, statesItAsZero] });

    // An observed zero, not an absent field: the two mean different things, and only one
    // of the two candidates actually measured this counter.
    expect(built.totals.cacheCreationTokens).toBe(0);

    const reversed = report({ records: [statesItAsZero, missesTheCounter] });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(built));
  });
});

describe("buildCostReport — a local-read session total, the first kind: 'session' report figure (#697)", () => {
  const COPILOT_CAPABILITY = {
    localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
    export: { tokenCounters: false, amount: false, toolStatedStep: false, agentName: false },
    journalAttributable: true,
    taskAttributable: false,
  } as const;

  function reportWithCopilot(overrides: Partial<CostReportInput> = {}) {
    return buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [],
      journals: [],
      declaredTools: [
        { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
        { tool: "copilot", coverage: "covered", capability: COPILOT_CAPABILITY },
      ],
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
      ...overrides,
    });
  }

  const copilotSession = (overrides: Partial<TelemetrySinkRecord> = {}) =>
    sessionMeasure({
      tool: "copilot",
      provenance: "local-read",
      input_tokens: 10,
      output_tokens: 42,
      cache_read_tokens: 0,
      cache_creation_tokens: 21070,
      ...overrides,
    });

  it("carries a session total on the tool's own row, never on the period total", () => {
    const built = reportWithCopilot({ records: [copilotSession()] });
    const copilotRow = built.byTools.find((row) => row.tool === "copilot");

    expect(copilotRow?.sessionTotals).toEqual({
      requests: 0,
      inputTokens: 10,
      outputTokens: 42,
      cacheReadTokens: 0,
      cacheCreationTokens: 21070,
    });
    expect(built.totals).toEqual({ requests: 0 });
  });

  it("never enters by_step or by_day — it reconciles with neither", () => {
    const built = reportWithCopilot({
      records: [copilotSession({ event_timestamp: "2026-08-19T10:00:00Z" })],
    });

    expect(built.bySteps).toHaveLength(0);
    for (const day of built.byDays) expect(day.totals).toEqual({ requests: 0 });
  });

  it("stays off every row for a tool with no session-kind local-read record", () => {
    const built = reportWithCopilot({ records: [] });

    for (const row of built.byTools) expect(row.sessionTotals).toBeUndefined();
  });

  it("never folds an export-route session delta into the by-tool session total", () => {
    // Only a local-read "session" record is a one-shot, already-complete total; an
    // export-route one is a periodic flush's own delta and is never safe to show this way.
    const built = reportWithCopilot({
      records: [copilotSession({ provenance: "export", tool: "claude" })],
    });
    const claudeRow = built.byTools.find((row) => row.tool === "claude");

    expect(claudeRow?.sessionTotals).toBeUndefined();
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

  // Almost all of a real session's tokens are a subagent's, and every one of those lines
  // names its agent while almost none names its skill - so `by_step` reads near-empty.
  it("breaks the period down by the agent that ran, main thread included as its own row", () => {
    const built = report({
      declaredTools: TOOL_THAT_NAMES_AGENTS,
      records: [
        request({ agent_name: "aidd-dev:executor", input_tokens: 100 }),
        request({ agent_name: "aidd-dev:executor", input_tokens: 50 }),
        request({ agent_name: "Explore", input_tokens: 10 }),
        request({ input_tokens: 1 }),
      ],
    });

    expect(built.byAgents.map((row) => [row.agent, row.attribution, row.totals.requests])).toEqual([
      ["aidd-dev:executor", "tool-stated", 2],
      ["Explore", "tool-stated", 1],
      [undefined, "main-thread", 1],
    ]);
  });

  // Only Claude Code's reader ever sets `agent_name`, so reading its absence as the main
  // thread reported every record of every other tool as a main thread on no evidence.
  it("claims no main thread for a tool whose route never names an agent", () => {
    const built = report({
      declaredTools: [{ tool: "codex", coverage: "covered", capability: NO_CAPABILITY }],
      records: [request({ tool: "codex", input_tokens: 4 })],
    });

    expect(built.byAgents.map((row) => [row.agent, row.attribution])).toEqual([
      [undefined, "not-stated"],
    ]);
  });

  // A declared route is not a route that names agents: Codex reads token counters and
  // names no agent, so its records must read as a tool with no declared route does.
  it("claims no main thread for a route that is declared and still names no agent", () => {
    const built = report({
      declaredTools: [{ tool: "codex", coverage: "covered", capability: READS_BUT_NAMES_NO_AGENT }],
      records: [request({ tool: "codex", input_tokens: 4 })],
    });

    expect(built.byAgents.map((row) => row.attribution)).toEqual(["not-stated"]);
  });

  // Two records that named no agent, from two tools, are two rows and not one: merging
  // them would mix unattributable work with a tool's own measured main thread.
  it("keeps a main thread apart from a tool that could never have named one", () => {
    const built = report({
      declaredTools: [
        ...TOOL_THAT_NAMES_AGENTS,
        { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
      ],
      records: [
        request({ input_tokens: 5 }),
        request({ tool: "codex", input_tokens: 5, vendor_id: "v-codex" }),
      ],
    });

    expect(built.byAgents.map((row) => row.attribution).sort()).toEqual([
      "main-thread",
      "not-stated",
    ]);
  });

  it("reconciles the agent breakdown when a named, a main-thread and an unstated row all exist", () => {
    const built = report({
      declaredTools: [
        ...TOOL_THAT_NAMES_AGENTS,
        { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
      ],
      records: [
        request({ agent_name: "aidd-dev:checker", input_tokens: 7 }),
        request({ input_tokens: 3 }),
        request({ tool: "codex", input_tokens: 11, vendor_id: "v-codex" }),
      ],
    });

    expect(built.byAgents).toHaveLength(3);
    const summed = built.byAgents.reduce((total, row) => total + (row.totals.inputTokens ?? 0), 0);
    expect(summed).toBe(built.totals.inputTokens);
  });

  it("reconciles the agent breakdown to the same total as every other axis", () => {
    const built = report({
      declaredTools: TOOL_THAT_NAMES_AGENTS,
      records: [
        request({ agent_name: "aidd-dev:checker", input_tokens: 7 }),
        request({ input_tokens: 3 }),
      ],
    });

    const summed = built.byAgents.reduce((total, row) => total + (row.totals.inputTokens ?? 0), 0);
    expect(summed).toBe(built.totals.inputTokens);
  });

  // The one axis no host limit can empty - which is not the same as complete: the prompt
  // is resolved by walking `parentUuid`, not by a capture that may not have happened.
  it("breaks the period down by the prompt that caused the work, largest first", () => {
    const built = report({
      records: [
        request({ prompt_id: "p-1", input_tokens: 100 }),
        request({ prompt_id: "p-1", input_tokens: 50 }),
        request({ prompt_id: "p-2", input_tokens: 10 }),
        request({ input_tokens: 1 }),
      ],
    });

    expect(built.byPrompts.map((row) => [row.prompt, row.totals.requests])).toEqual([
      ["p-1", 2],
      ["p-2", 1],
      [undefined, 1],
    ]);
  });

  // An opaque id alone is unreadable, so the row carries the earliest moment in its group.
  // Earliest, never the first seen: the sink is append-ordered by read, not by turn.
  it("dates each prompt row by the earliest moment in that prompt, not the first record read", () => {
    const built = report({
      records: [
        request({ prompt_id: "p-1", event_timestamp: "2026-08-18T09:30:00.500Z" }),
        request({ prompt_id: "p-1", event_timestamp: "2026-08-18T09:00:00.000Z" }),
      ],
    });

    expect(built.byPrompts.map((row) => row.startedAt)).toEqual(["2026-08-18T09:00:00Z"]);
  });

  // A record whose tool cannot say which prompt caused it is its own row, never merged
  // into one that named a prompt - the same rule `by_agent` and `by_model` follow.
  it("leaves records that named no prompt undated rather than dating them from another prompt", () => {
    const built = report({
      records: [
        request({ prompt_id: "p-1", event_timestamp: "2026-08-18T09:00:00.000Z" }),
        request({ event_timestamp: "2026-08-18T10:00:00.000Z" }),
      ],
    });
    const noPrompt = built.byPrompts.filter((row) => row.prompt === undefined);

    expect(noPrompt.map((row) => row.startedAt)).toEqual([undefined]);
  });

  // A remainder, not a prompt: sorting it among the prompts by size would rank a bucket
  // drawn from many turns against single turns.
  it("keeps the row for records that named no prompt last, even when it is the largest", () => {
    const built = report({
      records: [request({ input_tokens: 900 }), request({ prompt_id: "p-1", input_tokens: 10 })],
    });

    expect(built.byPrompts.map((row) => row.prompt)).toEqual(["p-1", undefined]);
  });

  // Every counter, not only the one this session happens to look at: 99% of a real
  // session's tokens are cache, and `requests` too, which a session record would break.
  it("reconciles the prompt breakdown to the same total as every other axis", () => {
    const built = report({
      records: [
        request({ prompt_id: "p-1", input_tokens: 7, output_tokens: 5, cache_read_tokens: 4000 }),
        request({ input_tokens: 3, output_tokens: 2, cache_creation_tokens: 900 }),
      ],
    });

    const summed = built.byPrompts.reduce(
      (total, row) => ({
        requests: total.requests + row.totals.requests,
        inputTokens: total.inputTokens + (row.totals.inputTokens ?? 0),
        outputTokens: total.outputTokens + (row.totals.outputTokens ?? 0),
        cacheReadTokens: total.cacheReadTokens + (row.totals.cacheReadTokens ?? 0),
        cacheCreationTokens: total.cacheCreationTokens + (row.totals.cacheCreationTokens ?? 0),
      }),
      {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }
    );

    expect(summed).toEqual({
      requests: built.totals.requests,
      inputTokens: built.totals.inputTokens,
      outputTokens: built.totals.outputTokens,
      cacheReadTokens: built.totals.cacheReadTokens,
      cacheCreationTokens: built.totals.cacheCreationTokens,
    });
  });

  it("splits the total four ways by how strongly each part was attributed", () => {
    const built = report({ records: RECORDS });
    expect(built.attributionMix.map((row) => [row.attribution, row.totals.requests])).toEqual([
      ["tool-stated", 2],
      ["prompt-matched", 0],
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

  // Every tool this report has ever seen runs at 90%-plus cache, so a weight blind to the
  // two cache counters orders a costless breakdown backwards.
  it("weighs a costless row by all four counters, cache included - not input and output alone", () => {
    const built = report({
      records: [
        request({
          turn_id: "light-cache",
          model: "light-cache",
          input_tokens: 500,
          output_tokens: 500,
        }),
        request({
          turn_id: "heavy-cache",
          model: "heavy-cache",
          input_tokens: 10,
          output_tokens: 5,
          cache_read_tokens: 900_000,
        }),
      ],
    });

    expect(built.byModels.map((row) => row.model)).toEqual(["heavy-cache", "light-cache"]);
  });
});

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

  // `project_id: ""` is not a name - it is what a tool writes when it has none to give.
  // Its own row would print something nobody can act on, and disagree with `projectKeyOf`.
  it("treats an empty-string project_id the same as no project at all", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" }),
        request({ turn_id: "b", cost_usd: 2, project_id: "" }),
        request({ turn_id: "c", cost_usd: 3 }),
      ],
    });

    expect(built.byProjects).toHaveLength(2);
    const unknown = built.byProjects.find((row) => row.project === undefined);
    expect(unknown?.totals.requests).toBe(2);
    expect(unknown?.totals.costMicroUsd).toBe(toMicroUsd(5));
  });
});

describe("buildCostReport — an unknown keeps its row, never a zero", () => {
  // Both the Codex and OpenCode readers permit a request record with no model, so without
  // this row `byModels` stopped reconciling to its own total with nothing naming the gap.
  it("gives a record with no model its own row in byModels, and it still reconciles", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 2, model: "opus" }),
        request({ turn_id: "b", cost_usd: 1 }),
      ],
    });

    expect(built.byModels).toHaveLength(2);
    const unknown = built.byModels.find((row) => row.model === undefined);
    expect(unknown?.totals.requests).toBe(1);
    expect(unknown?.totals.costMicroUsd).toBe(toMicroUsd(1));

    const total = built.byModels.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    expect(total).toBe(built.totals.costMicroUsd);
  });

  // `JSON.stringify(NaN)` is `null`, which round-trips as `null !== undefined` - which is
  // why `cost_usd` needs a `typeof` guard rather than an `!== undefined` one.
  it("reads a non-numeric cost as unknown, never as a zero", () => {
    const damaged = parseTelemetrySinkLine(
      JSON.stringify({ ...request({ turn_id: "x" }), cost_usd: Number.NaN })
    );
    expect(damaged.cost_usd).toBeNull();

    const built = report({ records: [damaged] });

    expect(built.totals.requests).toBe(1);
    expect(built.totals.costMicroUsd).toBeUndefined();
  });

  // `telemetrySinkRecordDayKey` answers `undefined` for a string merely shaped like a
  // moment: the record stays in `totals` but invents no day row.
  it("gives a damaged moment no day row, while the total still holds it", () => {
    const damaged = parseTelemetrySinkLine(
      JSON.stringify({
        ...request({ turn_id: "y", cost_usd: 5 }),
        event_timestamp: "not-a-momentZ",
      })
    );
    const built = report({ records: [damaged] });

    expect(built.totals.requests).toBe(1);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(5));
    const total = built.byDays.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    expect(total).toBe(0);
    expect(built.byDays.every((row) => row.totals.requests === 0)).toBe(true);
  });
});

describe("buildCostReport — a task is a filter over a period", () => {
  const JOURNALS: readonly CostReportSessionJournal[] = [
    {
      vendorId: "s-task",
      tool: "claude-code",
      writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md"],
      taskIntervals: [],
      flowIntervals: [],
    },
    {
      vendorId: "s-other",
      tool: "claude-code",
      writtenPaths: ["cli/src/index.ts"],
      taskIntervals: [],
      flowIntervals: [],
    },
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

describe("buildCostReport — a task can be declared, not just derived", () => {
  const WANTED = "2026_08/wanted";
  const WANTED_PATH = "aidd_docs/tasks/2026_08/wanted/spec.md";
  const declared = (at: string, path = WANTED_PATH) => ({
    path,
    startMs: Date.parse(at),
    endMs: 0,
  });
  const closedAt = (open: string, close: string) => ({
    ...declared(open),
    endMs: Date.parse(close),
  });

  it("attributes a tool whose payloads name no path at all - a declared interval, never a written file", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-declared",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [closedAt("2026-08-17T10:00:00Z", "2026-08-17T11:00:00Z")],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-declared", cost_usd: 1, event_timestamp: "2026-08-17T10:30:00Z" }),
    ];

    const built = report({ records, journals, task: WANTED });

    expect(built.totals.requests).toBe(1);
    const mix = Object.fromEntries(
      (built.taskAttributionMix ?? []).map((row) => [row.attribution, row.totals.requests])
    );
    expect(mix).toEqual({ declared: 1, inferred: 0 });
  });

  it("a session that never declared and never wrote into the folder belongs to none - never the last one seen", () => {
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
      request({ vendor_id: "s-silent", cost_usd: 9, event_timestamp: "2026-08-17T10:30:00Z" }),
    ];

    expect(report({ records, journals, task: WANTED }).totals.requests).toBe(0);
  });

  it("a declaration left open by one session does not reach a later, unrelated one", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        // Crashed mid-task: an interval with no closing turn_end, capped at its own start.
        vendorId: "s-crashed",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [declared("2026-08-17T10:00:00Z")],
        flowIntervals: [],
      },
      {
        vendorId: "s-later",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-later", cost_usd: 5, event_timestamp: "2026-08-20T09:00:00Z" }),
    ];

    expect(report({ records, journals, task: WANTED }).totals.requests).toBe(0);
  });

  it("an unclosed declaration is capped at the journal's own last recorded moment, never left boundless", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-crashed",
        tool: "codex",
        writtenPaths: [],
        taskIntervals: [declared("2026-08-17T10:00:00Z")],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      // A re-read stores this later, but it never happened before the crash.
      request({ vendor_id: "s-crashed", cost_usd: 3, event_timestamp: "2026-08-17T10:30:00Z" }),
    ];

    expect(report({ records, journals, task: WANTED }).totals.requests).toBe(0);
  });

  it("a declared interval closes at its own bound - work after it falls back to inferred", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-mixed",
        tool: "claude",
        writtenPaths: [WANTED_PATH],
        taskIntervals: [closedAt("2026-08-17T10:00:00Z", "2026-08-17T10:15:00Z")],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-mixed", cost_usd: 1, event_timestamp: "2026-08-17T10:05:00Z" }),
      request({ vendor_id: "s-mixed", cost_usd: 2, event_timestamp: "2026-08-17T10:20:00Z" }),
    ];

    const built = report({ records, journals, task: WANTED });

    expect(built.totals.requests).toBe(2);
    const mix = Object.fromEntries(
      (built.taskAttributionMix ?? []).map((row) => [row.attribution, row.totals.requests])
    );
    expect(mix).toEqual({ declared: 1, inferred: 1 });
  });
});

describe("buildCostReport — by_flow reads the journal's own sequence, nothing declared", () => {
  it("gives two orchestrated runs of the same skill in one session two rows, never one merged by name", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-two-sdlc-runs",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T11:00:00Z"),
            endMs: Date.parse("2026-08-17T12:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-two-sdlc-runs",
        cost_usd: 3,
        event_timestamp: "2026-08-17T10:30:00Z",
      }),
      request({
        vendor_id: "s-two-sdlc-runs",
        cost_usd: 7,
        event_timestamp: "2026-08-17T11:30:00Z",
      }),
    ];

    const built = report({ records, journals });

    const named = built.byFlows.filter((row) => row.flow !== undefined);
    expect(named).toHaveLength(2);
    expect(named.every((row) => row.flow === "aidd-orchestrator:01-sdlc")).toBe(true);
    expect(named.map((row) => row.totals.requests).sort()).toEqual([1, 1]);
  });

  it("puts a hand-run skill's cost inside the flow it ran during - the journal cannot tell it apart from one the orchestrator invoked", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-hand-run",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T12:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      // A skill a person ran by hand, mid-flow.
      request({
        vendor_id: "s-hand-run",
        cost_usd: 2,
        step: "aidd-dev:02-implement",
        event_timestamp: "2026-08-17T10:30:00Z",
      }),
    ];

    const built = report({ records, journals });

    const flowRow = built.byFlows.find((row) => row.flow === "aidd-orchestrator:01-sdlc");
    expect(flowRow?.totals.requests).toBe(1);
  });

  it("gives work before the first orchestrating step its own row, outside any flow", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-before",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-before", cost_usd: 1, event_timestamp: "2026-08-17T09:00:00Z" }),
      request({ vendor_id: "s-before", cost_usd: 4, event_timestamp: "2026-08-17T10:30:00Z" }),
    ];

    const built = report({ records, journals });

    const outside = built.byFlows.find((row) => row.flow === undefined);
    expect(outside?.totals.requests).toBe(1);
    expect(outside?.totals.costMicroUsd).toBe(toMicroUsd(1));
  });

  it("puts the outside-every-flow row last even when it is the largest - the tail convention by_task and by_backlog already keep", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-outside-is-biggest",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      // Outside the flow, and worth ten times what ran inside it. Sorted by size alone this
      // row led the table; the named run has to come first all the same.
      request({
        vendor_id: "s-outside-is-biggest",
        cost_usd: 90,
        event_timestamp: "2026-08-17T09:00:00Z",
      }),
      request({
        vendor_id: "s-outside-is-biggest",
        cost_usd: 9,
        event_timestamp: "2026-08-17T10:30:00Z",
      }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows.map((row) => row.flow)).toEqual(["aidd-orchestrator:01-sdlc", undefined]);
    expect(built.byFlows[1]?.totals.costMicroUsd).toBe(toMicroUsd(90));
  });

  it("gives a session that never ran an orchestrating skill exactly one row, outside every flow, total intact", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-plain",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-plain", cost_usd: 5, event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows).toHaveLength(1);
    expect(built.byFlows[0]?.flow).toBeUndefined();
    expect(built.byFlows[0]?.totals.requests).toBe(1);
  });

  it("holds nothing, and says so rather than swallowing later work, for a flow opened at the journal's very last moment", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-opened-last",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        // Unclosed - capped at its own start, the journal's own last witnessed moment.
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T10:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      // At the very moment the flow opened - the half-open interval [t, t) holds nothing.
      request({ vendor_id: "s-opened-last", cost_usd: 9, event_timestamp: "2026-08-17T10:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows.some((row) => row.flow === "aidd-orchestrator:01-sdlc")).toBe(false);
    const outside = built.byFlows.find((row) => row.flow === undefined);
    expect(outside?.totals.requests).toBe(1);
  });

  // A session resumed after its context was compacted fires no `step_start`, so its journal
  // opens no flow while the transcript goes on stating the step on every record.
  it("names the flow a record's own tool stated, where no interval covers it", () => {
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-no-journal",
        cost_usd: 4,
        event_timestamp: "2026-08-17T10:30:00Z",
        step_attribution: "tool-stated",
        step: "aidd-orchestrator:01-sdlc",
      }),
    ];

    const built = report({ records, journals: [] });

    const named = built.byFlows.find((row) => row.flow === "aidd-orchestrator:01-sdlc");
    expect(named?.attribution).toBe("tool-stated");
    expect(named?.totals.requests).toBe(1);
    // A name is not a run: the row is a bucket drawn from every run of that skill the tool
    // named, so it asserts no single moment the way an interval-derived row does.
    expect(named?.startedAt).toBeUndefined();
  });

  it("keeps a record the journal witnessed on the interval's row, never the tool-stated one", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-both",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-both",
        cost_usd: 5,
        event_timestamp: "2026-08-17T10:30:00Z",
        step_attribution: "tool-stated",
        step: "aidd-orchestrator:01-sdlc",
      }),
    ];

    const built = report({ records, journals });

    const rows = built.byFlows.filter((row) => row.flow === "aidd-orchestrator:01-sdlc");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attribution).toBe("journal-interval");
    expect(rows[0]?.startedAt).toBe("2026-08-17T10:00:00Z");
  });

  it("opens no flow for a tool-stated step that names no orchestrating skill", () => {
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-plain-skill",
        cost_usd: 6,
        event_timestamp: "2026-08-17T10:30:00Z",
        step_attribution: "tool-stated",
        step: "aidd-dev:01-plan",
      }),
    ];

    const built = report({ records, journals: [] });

    expect(built.byFlows.map((row) => row.flow)).toEqual([undefined]);
    expect(built.byFlows[0]?.attribution).toBe("unattributed");
  });

  // An interval is the only thing that can say *which run*: a step inferred from a moment
  // says neither run nor that a flow was ever orchestrated, so it opens no flow row.
  it("opens no flow for an orchestrating step the reader merely inferred", () => {
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-inferred",
        cost_usd: 7,
        event_timestamp: "2026-08-17T10:30:00Z",
        step_attribution: "journal-interval",
        step: "aidd-orchestrator:01-sdlc",
      }),
    ];

    const built = report({ records, journals: [] });

    expect(built.byFlows.map((row) => row.flow)).toEqual([undefined]);
  });

  it("reconciles by_flow to the same total when a tool-stated flow row is present", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-interval",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-interval", cost_usd: 1, event_timestamp: "2026-08-17T10:30:00Z" }),
      request({
        vendor_id: "s-stated",
        cost_usd: 2,
        event_timestamp: "2026-08-17T12:00:00Z",
        step_attribution: "tool-stated",
        step: "aidd-orchestrator:02-backlog",
      }),
      request({ vendor_id: "s-neither", cost_usd: 3, event_timestamp: "2026-08-17T13:00:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows).toHaveLength(3);
    expect(sumOf(built.byFlows)).toEqual({
      requests: built.totals.requests,
      costMicroUsd: built.totals.costMicroUsd,
      inputTokens: built.totals.inputTokens ?? 0,
      outputTokens: built.totals.outputTokens ?? 0,
    });
  });

  it("reconciles by_flow to the same total as every other breakdown", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-mixed-flows",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T10:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
          {
            skill: "aidd-orchestrator:02-backlog",
            startMs: Date.parse("2026-08-17T11:00:00Z"),
            endMs: Date.parse("2026-08-17T12:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({ vendor_id: "s-mixed-flows", cost_usd: 1, event_timestamp: "2026-08-17T09:00:00Z" }),
      request({ vendor_id: "s-mixed-flows", cost_usd: 2, event_timestamp: "2026-08-17T10:30:00Z" }),
      request({ vendor_id: "s-mixed-flows", cost_usd: 3, event_timestamp: "2026-08-17T11:30:00Z" }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows).toHaveLength(3);
    expect(sumOf(built.byFlows)).toEqual({
      requests: built.totals.requests,
      costMicroUsd: built.totals.costMicroUsd,
      inputTokens: built.totals.inputTokens ?? 0,
      outputTokens: built.totals.outputTokens ?? 0,
    });
  });

  it("opens no flow for a skill outside the declared set, however plausible its name", () => {
    const journals: readonly CostReportSessionJournal[] = [
      {
        vendorId: "s-unrelated",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [],
        flowIntervals: [],
      },
    ];
    const records: readonly TelemetrySinkRecord[] = [
      request({
        vendor_id: "s-unrelated",
        cost_usd: 1,
        step: "aidd-orchestrator:03-does-not-exist",
        event_timestamp: "2026-08-17T10:00:00Z",
      }),
    ];

    const built = report({ records, journals });

    expect(built.byFlows).toHaveLength(1);
    expect(built.byFlows[0]?.flow).toBeUndefined();
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
    // Four rows even here: the total is known to be nothing, and none of it came from
    // any source. That is a measurement, not an absence.
    expect(built.attributionMix.map((row) => [row.attribution, row.totals.requests])).toEqual([
      ["tool-stated", 0],
      ["prompt-matched", 0],
      ["journal-interval", 0],
      ["unattributed", 0],
    ]);
  });

  it("names no tool and no skill, by string literal", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../../src/contexts/telemetry/domain/cost-report.ts", import.meta.url)
      ),
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
  // A re-read appends, so the same session's lines sit in different orders on two machines.
  // Repetition alone would never catch a group that carries insertion order.
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

describe("buildCostReport — any dimension filters as well as it groups", () => {
  const AT = "2026-08-18T10:00:00Z";
  const WIDGETS: readonly TelemetrySinkRecord[] = [
    request({
      turn_id: "a",
      cost_usd: 1,
      model: "opus",
      step: "impl",
      step_attribution: "tool-stated",
      tool: "claude",
      project_id: "acme/widgets",
      event_timestamp: AT,
    }),
    request({
      turn_id: "b",
      cost_usd: 2,
      model: "sonnet",
      step: "review",
      step_attribution: "tool-stated",
      tool: "codex",
      project_id: "acme/widgets",
      event_timestamp: AT,
    }),
  ];
  const GADGETS: readonly TelemetrySinkRecord[] = [
    request({
      turn_id: "c",
      cost_usd: 4,
      model: "opus",
      step: "impl",
      step_attribution: "tool-stated",
      tool: "claude",
      project_id: "acme/gadgets",
      event_timestamp: AT,
    }),
  ];
  const declaredTools = [
    { tool: "claude" as const, coverage: "covered" as const, capability: NO_CAPABILITY },
    { tool: "codex" as const, coverage: "covered" as const, capability: NO_CAPABILITY },
  ];
  const knownValues = {
    projects: new Set(["acme/widgets", "acme/gadgets"]),
    steps: new Set(["impl", "review"]),
    // "haiku" never appears on a WIDGETS/GADGETS record - known to the sweep, idle here.
    models: new Set(["opus", "sonnet", "haiku"]),
  };

  function narrowed(overrides: Partial<CostReportInput> = {}) {
    return report({ records: [...WIDGETS, ...GADGETS], declaredTools, knownValues, ...overrides });
  }

  it("narrows two filters to their intersection, never their union", () => {
    const built = narrowed({ filters: { project: "acme/widgets", model: "opus" } });

    expect(built.totals.requests).toBe(1);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(1));
  });

  it("says which selection it answered", () => {
    const built = narrowed({ filters: { project: "acme/widgets", step: "impl" } });

    expect(built.filters).toEqual({ project: "acme/widgets", step: "impl" });
  });

  it("filtering and grouping on the same single-keyed dimension answers with one row", () => {
    const byProject = narrowed({ filters: { project: "acme/widgets" } });
    expect(byProject.byProjects).toHaveLength(1);
    expect(byProject.byProjects[0]?.project).toBe("acme/widgets");

    const byModel = narrowed({ filters: { model: "opus" } });
    expect(byModel.byModels).toHaveLength(1);

    // by_tool is a breakdown of every *declared* tool - a --tool filter has to narrow that
    // list too, or an excluded tool would print a row a measured idle is not told from.
    const byTool = narrowed({ filters: { tool: "codex" } });
    expect(byTool.byTools).toHaveLength(1);
    expect(byTool.byTools[0]?.tool).toBe("codex");
    expect(byTool.byTools[0]?.totals.requests).toBe(1);
  });

  it("keeps a session-only figure under a step filter when a journal interval stamped one", () => {
    // Unlike model, a step can land on a session record: `resolveStepAttribution` runs over
    // every candidate regardless of kind.
    const sessionRecord: TelemetrySinkRecord = sessionMeasure({
      vendor_id: "s-3",
      tool: "claude",
      active_time_s: 30,
      project_id: "acme/widgets",
      step: "impl",
      step_attribution: "journal-interval",
    });

    const withStep = narrowed({ filters: { step: "impl" }, records: [...WIDGETS, sessionRecord] });
    const withOtherStep = narrowed({
      filters: { step: "review" },
      records: [...WIDGETS, sessionRecord],
    });

    expect(withStep.activeTimeSeconds).toBe(30);
    expect(withOtherStep.activeTimeSeconds).toBeUndefined();
  });

  it("says a tool was never seen without claiming a record check it never ran", () => {
    const built = narrowed({ filters: { tool: "opencode" } });

    expect(built.emptySelection).toEqual({ filter: "tool", value: "opencode", known: false });
  });

  it("reconciles every breakdown to this selection's own total, exactly", () => {
    const built = narrowed({ filters: { project: "acme/widgets" } });
    const total = (rows: readonly { readonly totals: CostTotals }[]) =>
      rows.reduce((sum, row) => sum + row.totals.requests, 0);

    for (const rows of [built.bySteps, built.byModels, built.byProjects, built.byDays]) {
      expect(total(rows)).toBe(built.totals.requests);
    }
  });

  it("names the filter that emptied a selection a project nobody ever worked in", () => {
    const built = narrowed({ filters: { project: "nobody-worked-here" } });

    expect(built.emptySelection).toEqual({
      filter: "project",
      value: "nobody-worked-here",
      known: false,
    });
  });

  it("tells that empty apart from a known value with no work in this period", () => {
    const built = narrowed({ filters: { model: "haiku" } });

    expect(built.emptySelection).toEqual({ filter: "model", value: "haiku", known: true });
  });

  it("names the combination, not either filter alone, when both are real but their overlap is empty", () => {
    const built = narrowed({ filters: { project: "acme/gadgets", model: "sonnet" } });

    expect(built.emptySelection).toEqual({
      filter: "model",
      value: "sonnet",
      known: true,
      combination: true,
    });
  });

  it("never reports a filter as the culprit when the period itself has nothing", () => {
    const built = report({
      fromDay: "2020-01-01",
      toDay: "2020-01-01",
      filters: { project: "acme/widgets" },
    });

    expect(built.emptySelection).toBeUndefined();
  });

  it("drops a session-only figure a model filter cannot speak to, never as a false zero", () => {
    const sessionRecord: TelemetrySinkRecord = sessionMeasure({
      vendor_id: "s-2",
      tool: "claude",
      active_time_s: 30,
      project_id: "acme/widgets",
    });

    const withModel = narrowed({
      filters: { model: "opus" },
      records: [...WIDGETS, sessionRecord],
    });
    const withProject = narrowed({
      filters: { project: "acme/widgets" },
      records: [...WIDGETS, sessionRecord],
    });

    expect(withModel.activeTimeSeconds).toBeUndefined();
    expect(withProject.activeTimeSeconds).toBe(30);
  });
});

describe("buildCostReport — a line on disk holds whatever it holds, not what a type declares", () => {
  /** A record carrying a field of the wrong type, built the only way one ever reaches this
   * module: through the real parse, which checks `sink_schema_version` and casts the rest. */
  function recordFromLine(overrides: Record<string, unknown>): TelemetrySinkRecord {
    return parseTelemetrySinkLine(JSON.stringify({ ...sessionMeasure(), ...overrides }));
  }

  it("ignores an active time that is not a number, rather than adding it", () => {
    const built = report({
      records: [recordFromLine({ active_time_s: "12" }), recordFromLine({ active_time_s: 30 })],
    });

    expect(built.activeTimeSeconds).toBe(30);
  });

  it("leaves a null active time unobserved, rather than counting it as a zero", () => {
    const built = report({ records: [recordFromLine({ active_time_s: null })] });

    expect(built.activeTimeSeconds).toBeUndefined();
  });

  it("still sums the active times that are numbers", () => {
    const built = report({
      records: [recordFromLine({ active_time_s: 12 }), recordFromLine({ active_time_s: 30 })],
    });

    expect(built.activeTimeSeconds).toBe(42);
  });
});
