import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseTelemetrySinkLine,
  SINK_SCHEMA_VERSION,
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { UnknownTelemetrySinkSchemaVersionError } from "../../../../src/kernel/errors.js";

describe("parseTelemetrySinkLine()", () => {
  it("rejects an unknown sink_schema_version rather than guessing its shape", () => {
    expect(() =>
      parseTelemetrySinkLine(JSON.stringify({ sink_schema_version: 999, kind: "request" }))
    ).toThrow(UnknownTelemetrySinkSchemaVersionError);
  });

  // The literal version this schema moved past — v1 carried no `provenance`, so guessing
  // one for it would be exactly the false "old route" default the field exists to forbid.
  it("rejects the v1 shape specifically, not just an unrecognised number", () => {
    expect(() =>
      parseTelemetrySinkLine(
        JSON.stringify({ sink_schema_version: 1, kind: "request", vendor_id: "s-1" })
      )
    ).toThrow(UnknownTelemetrySinkSchemaVersionError);
  });

  it("parses a hand-written fixture the mapper never produced", () => {
    const url = new URL("../../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
    const lines = readFileSync(fileURLToPath(url), "utf8").trim().split("\n");
    const records = lines.map(parseTelemetrySinkLine);

    const requestLine = records.find((r) => r.kind === "request");
    expect(requestLine?.vendor_id).toBeTruthy();
    expect(requestLine?.vendor_field).toBeTruthy();
    expect(requestLine?.cost_usd).toBeGreaterThan(0);
    expect(requestLine?.model).toBeTruthy();

    const sessionLine = records.find((r) => r.kind === "session" && r.active_time_s !== undefined);
    expect(sessionLine?.active_time_s).toBeGreaterThan(0);
    expect(sessionLine?.turn_id).toBeUndefined();
  });

  // `user_id` predates the rule that an export-provenance record carries no identity, and
  // the fixture still carries it on purpose: the sink is append-only, so a line a pre-removal
  // build already wrote keeps the field forever. Parsing must not choke on it, and nothing
  // reads it back out now that it is off the type.
  it("parses a stored line that still carries the now-removed user_id, inertly", () => {
    const url = new URL("../../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
    const lines = readFileSync(fileURLToPath(url), "utf8").trim().split("\n");
    expect(lines.some((line) => line.includes("user_id"))).toBe(true);

    const records = lines.map(parseTelemetrySinkLine);
    const legacy = records.find((r) => "user_id" in r);
    // `in` narrows the parsed record to one that still carries the field, so the value
    // below is read off a type - and the fixture losing the line fails here, loudly.
    if (legacy === undefined || !("user_id" in legacy)) {
      throw new Error("fixture no longer carries a user_id line");
    }
    expect(legacy.user_id).toBe("user_example_hash_0000000000000000");
  });

  it("carries provenance for both routes, on the same fixture", () => {
    const url = new URL("../../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
    const lines = readFileSync(fileURLToPath(url), "utf8").trim().split("\n");
    const records = lines.map(parseTelemetrySinkLine);
    expect(records.some((r) => r.provenance === "export")).toBe(true);
    expect(records.some((r) => r.provenance === "local-read")).toBe(true);
  });

  // This fixture predates cli_version entirely - the hand-written stand-in for a record a
  // build before this field existed actually wrote. Parsing it must not choke, and every
  // record on it must still be there to count: an unknown version costs a field, never a
  // figure.
  it("parses a line written before cli_version existed, losing no figure to the gap", () => {
    const url = new URL("../../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
    const lines = readFileSync(fileURLToPath(url), "utf8").trim().split("\n");
    expect(lines.some((line) => line.includes("cli_version"))).toBe(false);

    const records = lines.map(parseTelemetrySinkLine);
    expect(records).toHaveLength(lines.length);
    for (const record of records) {
      expect("cli_version" in record).toBe(false);
    }
  });
});

describe("telemetrySinkRecordDayKey()", () => {
  const BASE: TelemetrySinkRecord = {
    sink_schema_version: SINK_SCHEMA_VERSION,
    kind: "request",
    provenance: "local-read",
    tool: "claude",
    vendor_id: "s-1",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
  };

  it("answers the UTC day for a real moment, the fast path and the parsed one alike", () => {
    expect(telemetrySinkRecordDayKey({ ...BASE, event_timestamp: "2026-08-18T01:00:00Z" })).toBe(
      "2026-08-18"
    );
    // No `Z` offset - the parsed path, not the sliced one.
    expect(
      telemetrySinkRecordDayKey({ ...BASE, event_timestamp: "2026-08-18T01:00:00+05:00" })
    ).toBe("2026-08-17");
  });

  it("answers undefined for no moment at all", () => {
    expect(telemetrySinkRecordDayKey({ ...BASE })).toBeUndefined();
  });

  // The latent defect: ten-or-more characters ending in "Z" took the fast slice path
  // unconditionally, so a string merely shaped like a moment answered a fragment nothing on
  // the calendar matches ("not-a-mome") instead of the `undefined` this function's own
  // docstring promises. A day file mistakenly filed under a fragment like that would leave
  // the record in `totals` while it vanished from `byDays` - the two silently disagreeing.
  it("answers undefined for a string merely shaped like a moment, never a sliced fragment", () => {
    expect(
      telemetrySinkRecordDayKey({ ...BASE, event_timestamp: "not-a-momentZ" })
    ).toBeUndefined();
  });
});

describe("telemetrySinkRecordDayKey() — a line holds whatever it holds", () => {
  const BASE: TelemetrySinkRecord = {
    sink_schema_version: SINK_SCHEMA_VERSION,
    kind: "request",
    provenance: "local-read",
    tool: "claude",
    vendor_id: "s-1",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
  };

  // `parseTelemetrySinkLine` validates the schema version and casts the rest, so this field
  // is only a string by convention. A number used to pass the absence check and be read as
  // epoch milliseconds: the record landed on 1970-01-01, fell outside every real period,
  // and disappeared without ever counting as undated.
  /** Built through the real parse, which is the only way a record of the wrong shape ever
   * reaches this function: it checks `sink_schema_version` and casts the rest. */
  function recordFromLine(overrides: Record<string, unknown>): TelemetrySinkRecord {
    return parseTelemetrySinkLine(JSON.stringify({ ...BASE, ...overrides }));
  }

  it("answers nothing for a moment stored as a number, never 1970", () => {
    expect(telemetrySinkRecordDayKey(recordFromLine({ event_timestamp: 12_345 }))).toBeUndefined();
  });

  it("answers nothing for a moment stored as null", () => {
    expect(telemetrySinkRecordDayKey(recordFromLine({ event_timestamp: null }))).toBeUndefined();
  });
});
