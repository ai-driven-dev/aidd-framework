import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import {
  ARTEFACT_AXES,
  buildCostReportArtefact,
  isArtefactAxis,
} from "../../../src/application/display/cost-report-artefact.js";
import { printCostReport } from "../../../src/application/display/cost-report-display.js";
import { CLIOutput } from "../../../src/application/output.js";
import { buildCostReport, type CostReportInput } from "../../../src/domain/models/cost-report.js";
import { toCostReportEnvelope } from "../../../src/domain/models/cost-report-envelope.js";
import { bareOrchestratingSkillNames } from "../../../src/domain/models/flow-attribution.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import type { PersonIdentity } from "../../../src/domain/ports/person-identity-reader.js";

/** Extends the real output rather than standing in for it — same reasoning as
 * cost-report-display.unit.test.ts's own `CapturingOutput`. */
class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
}

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
  // The row a declared identity now names retroactively. Rendered as that person, never as
  // "nobody opted in": `personLabel` used to fall through to the no-identifier label for
  // every resolution it did not name, so a value added to `PersonResolution` reached a
  // reader as its opposite without the compiler saying a word.
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

  // Finding 3 (review.md, "one route, and every sentence about it true"): `--axis` had no
  // way to say measurement was off either - a pasted table carried no word of it at all.
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

  // No identity declared on this machine: only then is "nobody opted in" the truth for a
  // record that carried no identifier. With one declared, that same record is this
  // machine's own person - the case the test above pins.
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

// One skill reached once from the tool's own statement and once from a journal interval is
// two rows sharing one step name (`by_step` is keyed on step + attribution together) - the
// table this axis pastes elsewhere is the one place that column can be dropped silently,
// since the terminal rendering carries it inline beside each row already.
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

  // Two rows carry no agent name and mean opposite things. A table that printed "the main
  // thread" for both would state, of a tool that never names an agent, a fact nothing
  // observed — the reading this axis gave every Codex, Copilot and OpenCode record.
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

  // The guard against writing the names out beside the set instead of reading them from it:
  // a project adding a fourth orchestrator is promised it need change nothing here, and a
  // hardcoded list of three would go on printing three while this turns red.
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

  // A limit is a statement about a mechanism that ran. A period whose only flow came from a
  // record's own tool never walked a step sequence, so the two limits of that walk describe
  // nothing that happened here and must not be printed.
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
