import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  type CostReportInput,
  type CostTotals,
  toMicroUsd,
} from "../../../src/domain/models/cost-report.js";
import {
  COST_REPORT_ENVELOPE_VERSION,
  toCostReportEnvelope,
} from "../../../src/domain/models/cost-report-envelope.js";
import type { PersonMapping } from "../../../src/domain/models/person-mapping.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";

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

/** One person declared two identifiers, from two different machines - the Test Scope's own
 * setup. */
function twoIdentitiesOnePerson(): PersonMapping {
  return {
    entries: [{ personId: "person-a", identities: ["person-a", "machine-1", "machine-2"] }],
  };
}

function sumOf(rows: readonly { readonly totals: CostTotals }[]): number {
  return rows.reduce((sum, row) => sum + row.totals.requests, 0);
}

describe("byPeople — one raw identity resolved per group, never merged or dropped", () => {
  it("two identifiers one person declared produce one row, not two", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1" }),
        request({ turn_id: "b", person_id: "machine-2" }),
      ],
    });

    const mappedRows = built.byPeople.filter((row) => row.resolution === "mapped");
    expect(mappedRows).toHaveLength(1);
    expect(mappedRows[0]?.person).toBe("person-a");
  });

  it("a mapped row names every raw identity behind it", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1" }),
        request({ turn_id: "b", person_id: "machine-2" }),
      ],
    });

    const mapped = built.byPeople.find((row) => row.resolution === "mapped");
    expect(mapped?.identities).toEqual(
      expect.arrayContaining(["person-a", "machine-1", "machine-2"])
    );
  });

  it("an identity nobody declared gets its own row, labelled unresolved", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [request({ turn_id: "a", person_id: "a-stranger" })],
    });

    const unresolved = built.byPeople.filter((row) => row.resolution === "unresolved");
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.identities).toEqual(["a-stranger"]);
  });

  it("two identifiers nobody declared produce two rows, never one merged bucket", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "a-stranger" }),
        request({ turn_id: "b", person_id: "another-stranger" }),
      ],
    });

    const unresolved = built.byPeople.filter((row) => row.resolution === "unresolved");
    expect(unresolved).toHaveLength(2);
    expect(unresolved.map((row) => row.identities[0]).sort()).toEqual([
      "a-stranger",
      "another-stranger",
    ]);
  });

  it("a record with no identifier lands in its own row, distinct from every unresolved one", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [request({ turn_id: "a", person_id: "a-stranger" }), request({ turn_id: "b" })],
    });

    const none = built.byPeople.filter((row) => row.resolution === "none");
    expect(none).toHaveLength(1);
    expect(none[0]?.person).toBeUndefined();
    const unresolved = built.byPeople.filter((row) => row.resolution === "unresolved");
    expect(unresolved).toHaveLength(1);
  });

  it("summing every person row's requests equals the report's own total", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1" }),
        request({ turn_id: "b", person_id: "machine-2" }),
        request({ turn_id: "c", person_id: "a-stranger" }),
        request({ turn_id: "d" }),
      ],
    });

    expect(sumOf(built.byPeople)).toBe(built.totals.requests);
    expect(built.totals.requests).toBe(4);
  });

  it("summing every person row's own money and tokens equals the report's own total", () => {
    const tokenFields = {
      input_tokens: 100,
      output_tokens: 40,
      cache_read_tokens: 15,
      cache_creation_tokens: 5,
    };
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1", cost_usd: 0.5, ...tokenFields }),
        request({ turn_id: "b", person_id: "machine-2", cost_usd: 0.25, ...tokenFields }),
        request({ turn_id: "c", person_id: "a-stranger", cost_usd: 0.1, ...tokenFields }),
        request({ turn_id: "d", cost_usd: 0.05, ...tokenFields }),
      ],
    });

    const summedCost = built.byPeople.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    const summedInputTokens = built.byPeople.reduce(
      (sum, row) => sum + (row.totals.inputTokens ?? 0),
      0
    );
    const summedOutputTokens = built.byPeople.reduce(
      (sum, row) => sum + (row.totals.outputTokens ?? 0),
      0
    );
    const summedCacheReadTokens = built.byPeople.reduce(
      (sum, row) => sum + (row.totals.cacheReadTokens ?? 0),
      0
    );
    const summedCacheCreationTokens = built.byPeople.reduce(
      (sum, row) => sum + (row.totals.cacheCreationTokens ?? 0),
      0
    );
    expect(summedCost).toBe(built.totals.costMicroUsd);
    expect(summedInputTokens).toBe(built.totals.inputTokens);
    expect(summedOutputTokens).toBe(built.totals.outputTokens);
    expect(summedCacheReadTokens).toBe(built.totals.cacheReadTokens);
    expect(summedCacheCreationTokens).toBe(built.totals.cacheCreationTokens);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(0.9));
    expect(built.totals.inputTokens).toBe(400);
    expect(built.totals.outputTokens).toBe(160);
    expect(built.totals.cacheReadTokens).toBe(60);
    expect(built.totals.cacheCreationTokens).toBe(20);
  });

  it("orders mapped rows first, then unresolved, then the no-identifier row last", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1" }),
        request({ turn_id: "b", person_id: "a-stranger" }),
        request({ turn_id: "c" }),
      ],
    });

    expect(built.byPeople.map((row) => row.resolution)).toEqual(["mapped", "unresolved", "none"]);
  });
});

describe("byPeople — no mapping declared at all", () => {
  it("resolves every identifier as unresolved, and leaves the figures unchanged", () => {
    const withMapping = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [request({ turn_id: "a", person_id: "machine-1" })],
    });
    const withoutMapping = report({
      records: [request({ turn_id: "a", person_id: "machine-1" })],
    });

    expect(withoutMapping.byPeople.every((row) => row.resolution !== "mapped")).toBe(true);
    expect(
      withoutMapping.byPeople.find((row) => row.identities.includes("machine-1"))?.resolution
    ).toBe("unresolved");
    expect(withoutMapping.totals).toEqual(withMapping.totals);
  });

  it("personMappingUnreadable defaults to false when nothing said otherwise", () => {
    expect(report().personMappingUnreadable).toBe(false);
  });

  it("carries personMappingUnreadable through when the caller states it", () => {
    expect(report({ personMappingUnreadable: true }).personMappingUnreadable).toBe(true);
  });
});

describe("the envelope carries by_person for a program to parse", () => {
  it("carries the person rows, their identities, and a raised report version", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({ turn_id: "a", person_id: "machine-1" }),
        request({ turn_id: "b", person_id: "a-stranger" }),
      ],
    });
    const envelope = toCostReportEnvelope(built);

    expect(envelope.cost_report_version).toBe(COST_REPORT_ENVELOPE_VERSION);
    expect(envelope.by_person.length).toBeGreaterThan(0);
    const mapped = envelope.by_person.find((row) => row.resolution === "mapped");
    expect(mapped?.identities).toEqual(expect.arrayContaining(["machine-1"]));
    expect(envelope.read.person_mapping_unusable).toBe(false);
  });
});

describe("byPeople — a billed call seen by both routes keeps its person", () => {
  // The export route never carries a person (telemetry-sink-record.ts's own contract), so
  // the survivor `mergeBilledRequestGroup` picks by `cost_usd` is exactly the export
  // record - the one sibling in the group with no person_id at all. Discharging the note
  // `mergeBilledRequestGroup`'s doc comment used to carry: without `withPersonBackfill`,
  // this exact case would silently drop a mapped person's own work into `"none"`.
  it("backfills the local-read sibling's person_id onto the export-route survivor", () => {
    const built = report({
      personMapping: twoIdentitiesOnePerson(),
      records: [
        request({
          billed_request_id: "call-1",
          provenance: "export",
          cost_usd: 1,
          input_tokens: 10,
          // No person_id: the export route's own contract.
        }),
        request({
          billed_request_id: "call-1",
          provenance: "local-read",
          person_id: "machine-1",
          // No cost_usd: no local reader has ever captured one - never the survivor by
          // `mergeBilledRequestGroup`'s own cost-bearing rule.
        }),
      ],
    });

    expect(built.totals.requests).toBe(1);
    const mapped = built.byPeople.find((row) => row.resolution === "mapped");
    expect(mapped?.person).toBe("person-a");
    expect(mapped?.totals.requests).toBe(1);
    expect(built.byPeople.some((row) => row.resolution === "none")).toBe(false);
  });
});
