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

  // The fixture carries `user_id` on purpose: the sink is append-only, so a line an earlier
  // build wrote keeps the field forever and parsing must not choke on it.
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

  // This fixture predates cli_version entirely: an unknown version costs a field, never a
  // figure, so every record on it must still be there to count.
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

  // A string merely shaped like a moment must not take the fast slice path: a record filed
  // under a fragment nothing on the calendar matches stays in `totals` but leaves `byDays`.
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

  /** Built through the real parse, which checks `sink_schema_version` and casts the rest —
   * the only way a record whose field is a string by convention alone ever gets here. */
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
