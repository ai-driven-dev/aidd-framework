import { describe, expect, it } from "vitest";
import {
  ARTEFACT_AXES,
  buildCostReportArtefact,
  isArtefactAxis,
} from "../../../src/application/display/cost-report-artefact.js";
import { buildCostReport, type CostReportInput } from "../../../src/domain/models/cost-report.js";
import { toCostReportEnvelope } from "../../../src/domain/models/cost-report-envelope.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import type { PersonIdentity } from "../../../src/domain/ports/person-identity-reader.js";

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
      ...overrides,
    })
  );
}

function onePersonMapping(): PersonIdentity {
  return { personId: "person-a", origin: "adopted", alsoMe: ["machine-1"], displayName: "Ada" };
}

describe("buildCostReportArtefact", () => {
  it("lists person among the known axes", () => {
    expect(ARTEFACT_AXES).toContain("person");
    expect(isArtefactAxis("person")).toBe(true);
  });

  it("refuses an unknown axis by name, listing the ones that exist", () => {
    expect(() => buildCostReportArtefact(envelopeOf(), "bogus")).toThrow(
      /Unknown axis 'bogus'.*person/su
    );
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

  it("labels the no-identifier row distinctly from an unresolved one", () => {
    const envelope = envelopeOf({
      identity: onePersonMapping(),
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
