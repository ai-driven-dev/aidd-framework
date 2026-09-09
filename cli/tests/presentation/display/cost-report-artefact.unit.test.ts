import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import {
  buildCostReport,
  type CostReportInput,
} from "../../../src/contexts/telemetry/domain/cost-report.js";
import { toCostReportEnvelope } from "../../../src/contexts/telemetry/domain/cost-report-envelope.js";
import { bareOrchestratingSkillNames } from "../../../src/contexts/telemetry/domain/flow-attribution.js";
import type { PersonIdentity } from "../../../src/contexts/telemetry/domain/ports/person-identity-reader.js";
import type { TelemetrySinkRecord } from "../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import {
  ARTEFACT_AXES,
  buildCostReportArtefact,
  isArtefactAxis,
} from "../../../src/presentation/display/cost-report-artefact.js";
import { printCostReport } from "../../../src/presentation/display/cost-report-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

const NO_CAPABILITY = {
  localRead: null,
  export: null,
  journalAttributable: false,
  taskAttributable: false,
} as const;

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

function envelopeOf(overrides: Partial<CostReportInput> = {}) {
  return toCostReportEnvelope(
    buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [],
      journals: [],
      declaredTools: [{ tool: "claude", coverage: "covered", capability: NO_CAPABILITY }],
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
      ...overrides,
    })
  );
}

function onePersonMapping(): PersonIdentity {
  return { personId: "person-a", origin: "adopted", alsoMe: ["machine-1"], displayName: "Ada" };
}

describe("buildCostReportArtefact", () => {
  // A resolution `personLabel` does not name must not fall through to the no-identifier
  // label: a value added to `PersonResolution` would reach a reader as its opposite.
  it("names a row this machine's identity claims after that person, not as nobody", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a", event_timestamp: "2026-08-17T10:00:00Z" })],
      identity: onePersonMapping(),
    });

    const artefact = buildCostReportArtefact(envelope, "person");

    expect(artefact).toContain("Ada");
    expect(artefact).not.toContain("nobody opted in");
  });

  it("lists person among the known axes", () => {
    expect(ARTEFACT_AXES).toContain("person");
    expect(isArtefactAxis("person")).toBe(true);
  });

  it("answers the prompt axis with one dated row per prompt, and the remainder last", () => {
    const artefact = buildCostReportArtefact(
      envelopeOf({
        records: [
          request({
            turn_id: "a",
            prompt_id: "p-1",
            cost_usd: 2,
            event_timestamp: "2026-08-18T09:00:00Z",
          }),
          request({ turn_id: "b", cost_usd: 1, event_timestamp: "2026-08-18T10:00:00Z" }),
        ],
      }),
      "prompt"
    );

    expect(artefact).toContain("| Prompt | Started at | Total |");
    const lines = artefact
      .split("\n")
      .filter((line) => line.startsWith("| p-1") || line.includes("no prompt named"));
    expect(lines[0]).toContain("| p-1 | 2026-08-18T09:00:00Z |");
    expect(lines[1]).toContain("| no prompt named | — |");
  });

  it("refuses an unknown axis by name, listing the ones that exist", () => {
    expect(() => buildCostReportArtefact(envelopeOf(), "bogus")).toThrow(
      /Unknown axis 'bogus'.*person/su
    );
  });

  // A pasted table leaves the terminal behind, so it has to carry the switch being off itself.
  it("names the project's switch being off in its own header, on every axis", () => {
    const off = envelopeOf({ measurementEnabled: false });
    for (const axis of ARTEFACT_AXES) {
      expect(buildCostReportArtefact(off, axis)).toContain("this project's switch is off");
    }
  });

  it("says nothing about the switch in the header when it is on", () => {
    const on = envelopeOf({ measurementEnabled: true });
    expect(buildCostReportArtefact(on, "total")).not.toContain("switch is off");
  });

  it("prints one row per person with the identities behind it, mapped rows first", () => {
    const envelope = envelopeOf({
      identity: onePersonMapping(),
      records: [request({ turn_id: "a", person_id: "machine-1" })],
    });

    const artefact = buildCostReportArtefact(envelope, "person");

    expect(artefact).toContain("Ada");
    expect(artefact).toContain("machine-1");
  });

  it("prints two unplaced identifiers as two labelled rows, never one bucket", () => {
    const envelope = envelopeOf({
      identity: onePersonMapping(),
      records: [
        request({ turn_id: "a", person_id: "a-stranger" }),
        request({ turn_id: "b", person_id: "another-stranger" }),
      ],
    });

    const artefact = buildCostReportArtefact(envelope, "person");

    expect(artefact).toContain("a-stranger");
    expect(artefact).toContain("another-stranger");
    const unresolvedLines = artefact.split("\n").filter((line) => line.includes("unresolved"));
    expect(unresolvedLines).toHaveLength(2);
  });

  // Only with no identity declared on this machine is "nobody opted in" true of a record
  // carrying no identifier; with one declared, that record is this machine's own person.
  it("labels the no-identifier row distinctly from an unresolved one", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a" }), request({ turn_id: "b", person_id: "a-stranger" })],
    });

    const artefact = buildCostReportArtefact(envelope, "person");
    const rows = artefact
      .split("\n")
      .filter((line) => line.includes("nobody opted in") || line.includes("unresolved"));

    expect(rows).toHaveLength(2);
    const [unresolvedRow] = rows.filter((line) => line.includes("unresolved"));
    const [noneRow] = rows.filter((line) => line.includes("nobody opted in"));
    // The two labels must never be interchangeable: neither row's label is a substring of
    // the other's, so a reader can never mistake one bucket for the other.
    expect(unresolvedRow).not.toContain("nobody opted in");
    expect(noneRow).not.toContain("unresolved");
  });

  it("prints every figure and a caveat when the identity could not be read", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a", cost_usd: 1, person_id: "machine-1" })],
      identityUnusableCause: "unreadable",
    });

    const artefact = buildCostReportArtefact(envelope, "person");

    expect(artefact).toContain("$1.00");
    expect(artefact).toMatch(/own identity could not be read/u);
  });

  it("prints every figure and a different caveat when no identity was declared at all", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a", cost_usd: 1, person_id: "machine-1" })],
      identityUnusableCause: "absent",
    });

    const artefact = buildCostReportArtefact(envelope, "person");

    expect(artefact).toContain("$1.00");
    expect(artefact).toMatch(/no identity was declared/u);
  });

  it("prints no person caveat on the total axis when nobody opted in - that is the default state, not a degraded read", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a", cost_usd: 1 })],
      identityUnusableCause: "absent",
    });

    const artefact = buildCostReportArtefact(envelope, "total");

    expect(artefact).toContain("$1.00");
    expect(artefact).not.toMatch(/no identity was declared/u);
  });

  it("still prints the unreadable caveat on the total axis - that one is real damage", () => {
    const envelope = envelopeOf({
      records: [request({ turn_id: "a", cost_usd: 1 })],
      identityUnusableCause: "unreadable",
    });

    const artefact = buildCostReportArtefact(envelope, "total");

    expect(artefact).toMatch(/own identity could not be read/u);
  });

  it("names two different causes with two different caveats", () => {
    const unreadable = buildCostReportArtefact(
      envelopeOf({ identityUnusableCause: "unreadable" }),
      "person"
    );
    const absent = buildCostReportArtefact(
      envelopeOf({ identityUnusableCause: "absent" }),
      "person"
    );

    expect(unreadable).not.toBe(absent);
    expect(unreadable).toMatch(/could not be read/u);
    expect(absent).toMatch(/no identity was declared/u);
  });
});

// `by_step` is keyed on step plus attribution, so one skill can hold two rows sharing a name.
// A pasted table is the one place that column can be dropped silently.
describe("buildCostReportArtefact — by step, two rows sharing one name", () => {
  const STEP = "aidd-dev:02-implement";

  function ambiguousStepInput(): CostReportInput {
    return {
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [
        request({
          turn_id: "a",
          step_attribution: "tool-stated",
          step: STEP,
          input_tokens: 1000,
        }),
        request({
          turn_id: "b",
          step_attribution: "journal-interval",
          step: STEP,
          input_tokens: 500,
        }),
      ],
      journals: [],
      declaredTools: [{ tool: "claude", coverage: "covered", capability: NO_CAPABILITY }],
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
    };
  }

  it("carries the attribution on every row, so two rows for one step are distinguishable on their own", () => {
    const report = buildCostReport(ambiguousStepInput());
    const artefact = buildCostReportArtefact(toCostReportEnvelope(report), "step");

    const stepLines = artefact.split("\n").filter((line) => line.startsWith(`| ${STEP} |`));
    expect(stepLines).toHaveLength(2);
    expect(stepLines.some((line) => line.includes("stated by the tool"))).toBe(true);
    expect(stepLines.some((line) => line.includes("from a journal interval"))).toBe(true);
  });

  it("reconciles to what the terminal prints for that step, row for row", () => {
    const report = buildCostReport(ambiguousStepInput());
    const artefact = buildCostReportArtefact(toCostReportEnvelope(report), "step");
    const output = new CapturingOutput();
    printCostReport(output, report);
    const terminalText = output.lines.join("\n");

    // Both renderings read the same `bySteps` data; the true total for the step (never
    // itself printed as one line, by either renderer) is what a reader sums the rows to.
    expect(terminalText).toContain(STEP);
    expect(terminalText).toMatch(/stated by the tool/u);
    expect(terminalText).toMatch(/from a journal interval/u);

    const toolStatedRow = artefact
      .split("\n")
      .find((line) => line.startsWith(`| ${STEP} |`) && line.includes("stated by the tool"));
    const journalIntervalRow = artefact
      .split("\n")
      .find((line) => line.startsWith(`| ${STEP} |`) && line.includes("journal interval"));
    expect(toolStatedRow).toContain("1,000 tokens");
    expect(journalIntervalRow).toContain("500 tokens");
    // 1,500 total input tokens across the two records - never printed as one row by either
    // renderer, but recoverable from the two rows a reader is given.
  });
});

describe("buildCostReportArtefact — the agent axis names which silence a row is", () => {
  const NAMES_AGENTS = {
    localRead: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: true },
    export: null,
    journalAttributable: false,
    taskAttributable: false,
  } as const;

  // Two rows carry no agent name and mean opposite things: printing "the main thread" for a
  // tool that never names an agent states, of that tool, a fact nothing observed.
  it("prints the main thread and a tool that names no agent as different rows", () => {
    const envelope = envelopeOf({
      declaredTools: [
        { tool: "claude", coverage: "covered", capability: NAMES_AGENTS },
        { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
      ],
      records: [
        request({ input_tokens: 10 }),
        request({ tool: "codex", vendor_id: "s-codex", input_tokens: 10 }),
      ],
    });

    const artefact = buildCostReportArtefact(envelope, "agent");

    expect(artefact).toContain("| the main thread |");
    expect(artefact).toContain("| the tool names no agent |");
  });

  it("prints the same two labels in the terminal rendering", () => {
    const report = buildCostReport({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      journals: [],
      undatedRecords: 0,
      unreadableLines: 0,
      measurementEnabled: true,
      declaredTools: [
        { tool: "claude", coverage: "covered", capability: NAMES_AGENTS },
        { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
      ],
      records: [
        request({ input_tokens: 10 }),
        request({ tool: "codex", vendor_id: "s-codex", input_tokens: 10 }),
      ],
    });
    const output = new CapturingOutput();

    printCostReport(output, report);

    const printed = output.lines.join("\n");
    expect(printed).toContain("the main thread");
    expect(printed).toContain("the tool names no agent");
  });
});

describe("buildCostReportArtefact — the flow axis states its own limits with the figures", () => {
  const FLOW_JOURNAL = [
    {
      vendorId: "s-1",
      tool: "claude-code" as const,
      writtenPaths: [],
      taskIntervals: [],
      flowIntervals: [
        {
          skill: "aidd-orchestrator:01-sdlc",
          startMs: Date.parse("2026-08-17T10:00:00Z"),
          endMs: Date.parse("2026-08-17T11:00:00Z"),
          closedBy: "boundary" as const,
        },
      ],
    },
  ];

  function withOneFlow() {
    return envelopeOf({
      records: [request({ event_timestamp: "2026-08-17T10:30:00Z", input_tokens: 10 })],
      journals: FLOW_JOURNAL,
    });
  }

  it("says a hand-run skill counts inside the flow it ran during", () => {
    expect(buildCostReportArtefact(withOneFlow(), "flow")).toContain(
      "a skill run by hand while a flow was open is counted inside it"
    );
  });

  it("says a same-named skill of the reader's own project opens a flow of its own", () => {
    expect(buildCostReportArtefact(withOneFlow(), "flow")).toContain("opens a flow of its own");
  });

  // The names are read from the declared set, never written out beside it: a hardcoded list
  // would go on printing its own three once a fourth orchestrator is declared.
  it("names every unqualified orchestrating skill the declared set holds, whatever it holds", () => {
    const artefact = buildCostReportArtefact(withOneFlow(), "flow");
    const bare = bareOrchestratingSkillNames();

    expect(bare.length).toBeGreaterThan(0);
    for (const name of bare) expect(artefact).toContain(name);
  });

  it("says neither when the period names no flow at all - a limit that bit nothing is noise", () => {
    const noFlow = envelopeOf({
      records: [request({ event_timestamp: "2026-08-17T10:30:00Z", input_tokens: 10 })],
      journals: [],
    });
    const artefact = buildCostReportArtefact(noFlow, "flow");
    expect(artefact).not.toContain("counted inside it");
    expect(artefact).not.toContain("opens a flow of its own");
  });

  // A limit is a statement about a mechanism that ran, and a period whose only flow its own
  // tool named never walked a step sequence.
  it("states no journal limit for a period whose only flow its own tool named", () => {
    const statedOnly = envelopeOf({
      records: [
        request({
          event_timestamp: "2026-08-17T10:30:00Z",
          input_tokens: 10,
          step_attribution: "tool-stated",
          step: "aidd-orchestrator:01-sdlc",
        }),
      ],
      journals: [],
    });

    const artefact = buildCostReportArtefact(statedOnly, "flow");

    expect(artefact).toContain("is every run of that skill at once");
    expect(artefact).not.toContain("counted inside it");
    expect(artefact).not.toContain("opens a flow of its own");
  });

  it("states no tool-stated limit for a period whose flows the journal all witnessed", () => {
    expect(buildCostReportArtefact(withOneFlow(), "flow")).not.toContain(
      "is every run of that skill at once"
    );
  });

  it("states them on the flow axis alone, never on every axis", () => {
    const envelope = withOneFlow();
    for (const axis of ARTEFACT_AXES.filter((name) => name !== "flow")) {
      expect(buildCostReportArtefact(envelope, axis)).not.toContain("counted inside it");
    }
  });
});

const THREE_TOOLS = [
  {
    tool: "claude",
    coverage: "covered",
    capability: {
      localRead: { tokenCounters: true, amount: true, toolStatedStep: true, agentName: true },
      export: null,
      journalAttributable: true,
      taskAttributable: true,
    },
  },
  { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
  {
    tool: "cursor",
    coverage: "not-covered",
    reason: "It writes no token count.",
    capability: NO_CAPABILITY,
  },
] as const satisfies CostReportInput["declaredTools"];

function threeDayInput(overrides: Partial<CostReportInput> = {}): CostReportInput {
  return {
    fromDay: "2026-08-17",
    toDay: "2026-08-19",
    declaredTools: [...THREE_TOOLS],
    records: [],
    journals: [],
    undatedRecords: 0,
    unreadableLines: 0,
    measurementEnabled: true,
    ...overrides,
  };
}

function threeDayRich(overrides: Partial<CostReportInput> = {}): CostReportInput {
  return threeDayInput({
    records: [
      request({
        turn_id: "a",
        prompt_id: "p-1",
        cost_usd: 6,
        input_tokens: 600,
        model: "opus",
        project_id: "acme/widgets",
        person_id: "machine-1",
        step: "aidd-dev:02-implement",
        step_attribution: "tool-stated",
        event_timestamp: "2026-08-17T10:00:00Z",
      }),
      request({
        turn_id: "b",
        cost_usd: 3,
        input_tokens: 300,
        person_id: "a-stranger",
        step: "aidd-dev:02-implement",
        step_attribution: "journal-interval",
        event_timestamp: "2026-08-18T10:00:00Z",
      }),
      request({
        turn_id: "c",
        cost_usd: 1,
        input_tokens: 100,
        event_timestamp: "2026-08-18T11:00:00Z",
      }),
    ],
    journals: [
      {
        vendorId: "s-1",
        tool: "claude-code",
        writtenPaths: ["aidd_docs/tasks/2026_08/2026_08_17_reporting/plan.md"],
        taskIntervals: [],
        flowIntervals: [
          {
            skill: "aidd-orchestrator:01-sdlc",
            startMs: Date.parse("2026-08-17T09:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
            closedBy: "boundary",
          },
        ],
      },
    ],
    identity: onePersonMapping(),
    undatedRecords: 3,
    unreadableLines: 2,
    ...overrides,
  });
}

function axisLines(from: CostReportInput, axis: string): string[] {
  return buildCostReportArtefact(toCostReportEnvelope(buildCostReport(from)), axis).split("\n");
}

const RICH_CAVEATS = [
  "3 records carry no moment and are in no period",
  "2 lines could not be read",
];

describe("buildCostReportArtefact — one period, every axis rendered whole", () => {
  it("answers the total axis with the period, the one figure and what the read could not do", () => {
    expect(axisLines(threeDayRich(), "total")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: total",
      "",
      "$10.00 — 1,000 tokens, 3 requests",
      ...RICH_CAVEATS,
    ]);
  });

  it("gives the day axis a row per day the period spans, the empty one included", () => {
    expect(axisLines(threeDayRich(), "day")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by day",
      "",
      "| Day | Total |",
      "| --- | --- |",
      "| 2026-08-17 | $6.00 — 600 tokens, 1 requests |",
      "| 2026-08-18 | $4.00 — 400 tokens, 2 requests |",
      "| 2026-08-19 | nothing in this period |",
      ...RICH_CAVEATS,
    ]);
  });

  it("keeps two rows sharing one step name apart by their attribution column", () => {
    expect(axisLines(threeDayRich(), "step")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by step",
      "",
      "| Step | Attribution | Total |",
      "| --- | --- | --- |",
      "| aidd-dev:02-implement | stated by the tool | $6.00 — 600 tokens, 1 requests |",
      "| aidd-dev:02-implement | from a journal interval | $3.00 — 300 tokens, 1 requests |",
      "| unattributed | unattributed | $1.00 — 100 tokens, 1 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("names the model axis's unnamed row rather than dropping it", () => {
    expect(axisLines(threeDayRich(), "model")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by model",
      "",
      "| Model | Total |",
      "| --- | --- |",
      "| opus | $6.00 — 600 tokens, 1 requests |",
      "| no known model | $4.00 — 400 tokens, 2 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("calls the agent axis's own row the main thread when the tool names agents", () => {
    expect(axisLines(threeDayRich(), "agent")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by agent",
      "",
      "| Agent | Total |",
      "| --- | --- |",
      "| the main thread | $10.00 — 1,000 tokens, 3 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("dates a named prompt row and em-dashes the one drawn from many turns", () => {
    expect(axisLines(threeDayRich(), "prompt")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by prompt",
      "",
      "| Prompt | Started at | Total |",
      "| --- | --- | --- |",
      "| p-1 | 2026-08-17T10:00:00Z | $6.00 — 600 tokens, 1 requests |",
      "| no prompt named | — | $4.00 — 400 tokens, 2 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("gives an unattributed task row its reason and no attribution", () => {
    expect(axisLines(threeDayRich(), "task")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by task",
      "",
      "| Task | Attribution | Total |",
      "| --- | --- | --- |",
      "| no usable task declaration in this session | — | $10.00 — 1,000 tokens, 3 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("gives the backlog axis two columns, never the task axis's third", () => {
    expect(axisLines(threeDayRich(), "backlog")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by backlog",
      "",
      "| Backlog item | Total |",
      "| --- | --- |",
      "| no usable task declaration in this session | $10.00 — 1,000 tokens, 3 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("carries the flow axis's two journal limits under its rows", () => {
    expect(axisLines(threeDayRich(), "flow")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by flow",
      "",
      "| Flow | Attribution | Opened at | Total |",
      "| --- | --- | --- | --- |",
      "| aidd-orchestrator:01-sdlc | from a journal interval | 2026-08-17T09:00:00Z | $6.00 — 600 tokens, 1 requests |",
      "| outside any flow | unattributed | — | $4.00 — 400 tokens, 2 requests |",
      "a skill run by hand while a flow was open is counted inside it: the orchestrator's own call and a person's write the identical step_start line",
      "a skill of this project named 00-async-dev, 01-sdlc or 02-backlog opens a flow of its own: outside a plugin a host names a skill by its folder alone, and this axis has only that name to go on",
      ...RICH_CAVEATS,
    ]);
  });

  it("gives every declared tool a row, the unread one included", () => {
    expect(axisLines(threeDayRich(), "tool")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by tool",
      "",
      "| Tool | Total |",
      "| --- | --- |",
      "| Claude Code | $10.00 — 1,000 tokens, 3 requests |",
      "| Codex | nothing in this period |",
      "| Cursor | not covered — It writes no token count. |",
      ...RICH_CAVEATS,
    ]);
  });

  it("names the project axis's unnamed row rather than dropping it", () => {
    expect(axisLines(threeDayRich(), "project")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by project",
      "",
      "| Project | Total |",
      "| --- | --- |",
      "| acme/widgets | $6.00 — 600 tokens, 1 requests |",
      "| no known project | $4.00 — 400 tokens, 2 requests |",
      ...RICH_CAVEATS,
    ]);
  });

  it("carries the identities behind every person row as that row's own evidence", () => {
    expect(axisLines(threeDayRich(), "person")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by person",
      "",
      "| Person | Identities | Total |",
      "| --- | --- | --- |",
      "| Ada | person-a, machine-1 | $6.00 — 600 tokens, 1 requests |",
      "| Ada | person-a, machine-1 | $1.00 — 100 tokens, 1 requests |",
      "| unresolved — not mapped to anyone (a-stranger) | a-stranger | $3.00 — 300 tokens, 1 requests |",
      ...RICH_CAVEATS,
    ]);
  });
});

describe("buildCostReportArtefact — what the header carries", () => {
  it("appends the switch being off to the axis it names, in full", () => {
    expect(axisLines(threeDayRich({ measurementEnabled: false }), "total")[0]).toBe(
      "period 2026-08-17 to 2026-08-19 — axis: total — this project's switch is off, figures are the whole sink, not scoped to it"
    );
  });

  it("names the task and every filter that narrowed the period, before the axis", () => {
    expect(
      axisLines(
        threeDayRich({
          task: "2026_08/2026_08_17_reporting",
          filters: { project: "acme/widgets" },
        }),
        "total"
      )[0]
    ).toBe(
      "period 2026-08-17 to 2026-08-19, task 2026_08/2026_08_17_reporting, filters: project=acme/widgets — axis: total"
    );
  });

  it("names the filter that emptied a selection, with why its value was never seen", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [request({ turn_id: "a", cost_usd: 1 })],
          filters: { project: "never-worked-here" },
        }),
        "total"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19, filters: project=never-worked-here — axis: total",
      "",
      "nothing in this selection",
      "project 'never-worked-here' matched nothing — no record has ever named this project",
    ]);
  });
});

describe("buildCostReportArtefact — a figure a row cannot state", () => {
  it("prints an empty period's one figure as nothing measured, never as a zero", () => {
    expect(axisLines(threeDayInput(), "total")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: total",
      "",
      "nothing in this period",
    ]);
  });

  it("prints an unknown amount beside the tokens a tool did count", () => {
    expect(
      axisLines(
        threeDayInput({ records: [request({ tool: "codex", input_tokens: 8898 })] }),
        "tool"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by tool",
      "",
      "| Tool | Total |",
      "| --- | --- |",
      "| Claude Code | nothing in this period |",
      "| Codex | amount unknown — 8,898 tokens, 1 requests |",
      "| Cursor | not covered — It writes no token count. |",
    ]);
  });

  it("prints a session total on its own tool row, never as nothing in this period", () => {
    expect(
      axisLines(
        {
          fromDay: "2026-08-17",
          toDay: "2026-08-17",
          declaredTools: [
            {
              tool: "copilot",
              coverage: "covered",
              capability: {
                localRead: {
                  tokenCounters: true,
                  amount: false,
                  toolStatedStep: false,
                  agentName: false,
                },
                export: null,
                journalAttributable: true,
                taskAttributable: false,
              },
            },
          ],
          records: [
            request({
              tool: "copilot",
              kind: "session",
              input_tokens: 10,
              output_tokens: 42,
              cache_creation_tokens: 21070,
            }),
          ],
          journals: [],
          undatedRecords: 0,
          unreadableLines: 0,
          measurementEnabled: true,
        },
        "tool"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-17 — axis: by tool",
      "",
      "| Tool | Total |",
      "| --- | --- |",
      "| GitHub Copilot | 21,122 tokens (session total, not requests) |",
    ]);
  });

  it("tells a tool that named no agent from the main thread, row for row", () => {
    expect(
      axisLines(
        threeDayInput({
          declaredTools: [THREE_TOOLS[0], THREE_TOOLS[1]],
          records: [
            request({ turn_id: "a", input_tokens: 10 }),
            request({ turn_id: "b", tool: "codex", vendor_id: "s-codex", input_tokens: 10 }),
          ],
        }),
        "agent"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by agent",
      "",
      "| Agent | Total |",
      "| --- | --- |",
      "| the main thread | amount unknown — 10 tokens, 1 requests |",
      "| the tool names no agent | amount unknown — 10 tokens, 1 requests |",
    ]);
  });

  it("em-dashes the identities column of the row nobody opted into", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [request({ turn_id: "a", cost_usd: 1 })],
          identityUnusableCause: "absent",
        }),
        "person"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by person",
      "",
      "| Person | Identities | Total |",
      "| --- | --- | --- |",
      "| no identity — nobody opted in | — | $1.00 — 0 tokens, 1 requests |",
      "no identity was declared; every identifier is reported unresolved",
    ]);
  });

  it("reports every identifier unresolved when this machine's identity could not be read", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [request({ turn_id: "a", cost_usd: 1, person_id: "machine-1" })],
          identityUnusableCause: "unreadable",
        }),
        "person"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by person",
      "",
      "| Person | Identities | Total |",
      "| --- | --- | --- |",
      "| unresolved — not mapped to anyone (machine-1) | machine-1 | $1.00 — 0 tokens, 1 requests |",
      "this machine's own identity could not be read; every identifier is reported unresolved",
    ]);
  });

  it("em-dashes the opening moment of a flow only a tool's own record named, and says why", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [
            request({
              turn_id: "a",
              input_tokens: 10,
              step_attribution: "tool-stated",
              step: "aidd-orchestrator:01-sdlc",
              event_timestamp: "2026-08-17T10:00:00Z",
            }),
          ],
        }),
        "flow"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by flow",
      "",
      "| Flow | Attribution | Opened at | Total |",
      "| --- | --- | --- | --- |",
      "| aidd-orchestrator:01-sdlc | stated by the tool | — | amount unknown — 10 tokens, 1 requests |",
      "a flow only a record's own tool named is every run of that skill at once: its journal opened no flow to bound one run from the next, so the row has no opening moment and its total is not one orchestration's",
    ]);
  });
});

describe("buildCostReportArtefact — a task the journal declared", () => {
  const DECLARED_TASK = threeDayInput({
    records: [
      request({ turn_id: "a", cost_usd: 2, event_timestamp: "2026-08-17T10:00:00Z" }),
      request({ turn_id: "b", cost_usd: 1, event_timestamp: "2026-08-18T10:00:00Z" }),
    ],
    journals: [
      {
        vendorId: "s-1",
        tool: "claude-code",
        writtenPaths: [],
        taskIntervals: [
          {
            path: "aidd_docs/tasks/2026_08/2026_08_17_reporting/plan.md",
            startMs: Date.parse("2026-08-17T09:00:00Z"),
            endMs: Date.parse("2026-08-17T11:00:00Z"),
          },
        ],
        flowIntervals: [],
      },
    ],
  });

  it("says a named task row rests on a declaration, and gives the rest its reason", () => {
    expect(axisLines(DECLARED_TASK, "task")).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by task",
      "",
      "| Task | Attribution | Total |",
      "| --- | --- | --- |",
      "| 2026_08/2026_08_17_reporting | declared by the flow | $2.00 — 0 tokens, 1 requests |",
      "| the journal falls silent before this record | — | $1.00 — 0 tokens, 1 requests |",
    ]);
  });

  it("names a task whose backlog declaration could not be read, never leaving the row blank", () => {
    expect(
      axisLines(
        {
          ...DECLARED_TASK,
          taskBacklogDeclarations: new Map([
            ["2026_08/2026_08_17_reporting", { kind: "unreadable" as const }],
          ]),
        },
        "backlog"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by backlog",
      "",
      "| Backlog item | Total |",
      "| --- | --- |",
      "| this task's backlog declaration could not be read | $2.00 — 0 tokens, 1 requests |",
      "| the journal falls silent before this record | $1.00 — 0 tokens, 1 requests |",
    ]);
  });
});

describe("buildCostReportArtefact — a fact a row carries beside its figure", () => {
  it("keeps a covered tool's own reason after the figure it qualifies", () => {
    expect(
      axisLines(
        threeDayInput({
          declaredTools: [
            THREE_TOOLS[0],
            {
              tool: "codex",
              coverage: "covered",
              capability: NO_CAPABILITY,
              reason: "Partial read.",
            },
          ],
          records: [request({ turn_id: "a", cost_usd: 1, tool: "codex" })],
        }),
        "tool"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19 — axis: by tool",
      "",
      "| Tool | Total |",
      "| --- | --- |",
      "| Claude Code | nothing in this period |",
      "| Codex | $1.00 — 0 tokens, 1 requests — Partial read. |",
    ]);
  });

  it("sums all four token counters into a row's own figure", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [
            request({
              turn_id: "a",
              cost_usd: 4,
              input_tokens: 10,
              output_tokens: 20,
              cache_read_tokens: 30,
              cache_creation_tokens: 40,
            }),
          ],
        }),
        "total"
      )[2]
    ).toBe("$4.00 — 100 tokens, 1 requests");
  });

  it("names an agent a record's own tool stated, above the main thread's own row", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [
            request({ turn_id: "a", cost_usd: 4, input_tokens: 100, agent_name: "reviewer" }),
            request({ turn_id: "b", cost_usd: 1, input_tokens: 5 }),
          ],
        }),
        "agent"
      ).slice(4)
    ).toEqual([
      "| reviewer | $4.00 — 100 tokens, 1 requests |",
      "| the main thread | $1.00 — 5 tokens, 1 requests |",
    ]);
  });

  it("says a filter emptied a selection only in combination with the rest of it", () => {
    expect(
      axisLines(
        threeDayInput({
          records: [
            request({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets", model: "opus" }),
            request({ turn_id: "b", cost_usd: 1, project_id: "acme/gadgets", model: "haiku" }),
          ],
          knownValues: {
            projects: new Set(["acme/widgets"]),
            steps: new Set(),
            models: new Set(["haiku"]),
          },
          filters: { project: "acme/widgets", model: "haiku" },
        }),
        "total"
      )
    ).toEqual([
      "period 2026-08-17 to 2026-08-19, filters: project=acme/widgets, model=haiku — axis: total",
      "",
      "nothing in this selection",
      "model 'haiku' matched nothing combined with the rest of this selection",
    ]);
  });
});
