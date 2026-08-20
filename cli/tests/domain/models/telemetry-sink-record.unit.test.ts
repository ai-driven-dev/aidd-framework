import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnknownTelemetrySinkSchemaVersionError } from "../../../src/domain/errors.js";
import {
  mapOtlpLogsToSinkRecords,
  mapOtlpMetricsToSinkRecords,
  parseTelemetrySinkLine,
  SINK_SCHEMA_VERSION,
  type TelemetrySessionMeasure,
  type TelemetryVendorIdentity,
} from "../../../src/domain/models/telemetry-sink-record.js";

function loadFixture(name: string): unknown {
  const url = new URL(`../../fixtures/telemetry-sink/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

interface RawAttribute {
  readonly key?: string;
  readonly value?: { readonly stringValue?: string; readonly intValue?: number | string };
}
interface RawLogsPayload {
  readonly resourceLogs?: ReadonlyArray<{
    readonly scopeLogs?: ReadonlyArray<{
      readonly logRecords?: ReadonlyArray<{ readonly attributes?: readonly RawAttribute[] }>;
    }>;
  }>;
}

/** Every `event.sequence` -> `event.timestamp` pair the raw export carries, read straight
 * off the fixture — independent of the mapper, to prove the collision exists in the
 * capture itself rather than in a hand-written record. */
function collectRawEventStamps(payload: unknown): Map<number, string> {
  const stamps = new Map<number, string>();
  for (const resourceLog of (payload as RawLogsPayload).resourceLogs ?? []) {
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const logRecord of scopeLog.logRecords ?? []) {
        const attrs = new Map((logRecord.attributes ?? []).map((a) => [a.key, a.value]));
        const seq = attrs.get("event.sequence")?.intValue;
        const ts = attrs.get("event.timestamp")?.stringValue;
        if (seq !== undefined && ts !== undefined) stamps.set(Number(seq), ts);
      }
    }
  }
  return stamps;
}

const CLAUDE_VENDOR: TelemetryVendorIdentity = {
  identityAttribute: "session.id",
  turnAttribute: "prompt.id",
};

const CLAUDE_MEASURES: readonly TelemetrySessionMeasure[] = [
  { metric: "claude_code.cost.usage", field: "cost_usd" },
  { metric: "claude_code.active_time.total", field: "active_time_s" },
  {
    metric: "claude_code.token.usage",
    field: "input_tokens",
    whenAttribute: "type",
    whenValue: "input",
  },
  {
    metric: "claude_code.token.usage",
    field: "output_tokens",
    whenAttribute: "type",
    whenValue: "output",
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_read_tokens",
    whenAttribute: "type",
    whenValue: "cacheRead",
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_creation_tokens",
    whenAttribute: "type",
    whenValue: "cacheCreation",
  },
];

const NEVER_KEPT_VALUES = [
  "person@example.com", // user.email
  "user_00EXAMPLEACCOUNTID0000000", // user.account_id
  "00000000-1111-4222-8333-444444444444", // user.account_uuid
  "00000000-2222-4333-8444-555555555555", // organization.id
  "Orca", // terminal.type
  "req_011CeAaRe8Mm7oS7xvfjDPw8", // request_id
  "1a4650df-4623-4bd3-81b3-287d21937040", // client_request_id
];

describe("mapOtlpLogsToSinkRecords()", () => {
  const logsPayload = loadFixture("otlp-logs-claude-code.json");

  it("holds user.email among the fixture's attributes (setup sanity)", () => {
    expect(JSON.stringify(logsPayload)).toContain("user.email");
  });

  it("maps the one billed request into a line naming the vendor field and the turn identifier", () => {
    const records = mapOtlpLogsToSinkRecords(logsPayload, [CLAUDE_VENDOR]);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.kind).toBe("request");
    expect(record.sink_schema_version).toBe(SINK_SCHEMA_VERSION);
    expect(record.vendor_id).toBe("7c53f826-fc3e-4729-8e2b-2cba887d3926");
    expect(record.vendor_field).toBe("session.id");
    expect(record.turn_id).toBe("a4b7b0b6-dc16-4889-b25a-def1d207aec9");
    expect(record.turn_field).toBe("prompt.id");
  });

  // The mapper only ever produces the export route — a locally read record is never built
  // from an OTLP attribute map, since a local reader has no such map to walk.
  it("marks a record built from a real captured export as provenance: export", () => {
    const [record] = mapOtlpLogsToSinkRecords(logsPayload, [CLAUDE_VENDOR]);
    expect(record.provenance).toBe("export");
  });

  it("keeps every allowlisted field present on the real captured payload", () => {
    const [record] = mapOtlpLogsToSinkRecords(logsPayload, [CLAUDE_VENDOR]);
    expect(record.project_id).toBe("aidd-lab/telemetry-proof");
    expect(record.user_id).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(record.cost_usd).toBeCloseTo(0.0132201, 6);
    expect(record.input_tokens).toBe(2);
    expect(record.output_tokens).toBe(4);
    expect(record.cache_read_tokens).toBe(43847);
    expect(record.cache_creation_tokens).toBe(0);
    expect(record.model).toBe("claude-sonnet-5");
    expect(record.effort).toBe("high");
    expect(record.speed).toBe("normal");
    expect(record.query_source).toBe("sdk");
    expect(record.duration_ms).toBe(1598);
    expect(record.event_timestamp).toBe("2026-08-18T17:04:39.258Z");
    expect(record.event_sequence).toBe(45);
  });

  // The load-bearing measurement for this phase, read from the capture itself: seq 45
  // (api_request, billed) and seq 46 (assistant_response) share one millisecond, so the
  // timestamp alone cannot order them. No fabricated record — the collision is the export's.
  it("shares a millisecond between two records one sequence apart (setup sanity)", () => {
    const stamps = collectRawEventStamps(logsPayload);
    expect(stamps.get(45)).toBe("2026-08-18T17:04:39.258Z");
    expect(stamps.get(45)).toBe(stamps.get(46));
  });

  // The subagent capture is the one fixture with two real billed lines, at different
  // sequences (50, 55). Together with the millisecond collision above and the stored
  // event_sequence asserted on the main fixture, this proves the stored sequence field
  // — not the timestamp — is what a reader would sort on to recover the export's order.
  it("orders multiple stored records by their own sequence, from stored data alone", () => {
    const subagentPayload = loadFixture("otlp-logs-claude-code-subagent.json");
    const records = mapOtlpLogsToSinkRecords(subagentPayload, [CLAUDE_VENDOR]);
    const sequenced = records.filter((record) => record.event_sequence !== undefined);
    const bySequence = [...sequenced].sort(
      (a, b) => (a.event_sequence ?? 0) - (b.event_sequence ?? 0)
    );
    expect(bySequence.map((record) => record.event_sequence)).toEqual([50, 55]);
  });

  it("stores the timestamp alone, inventing no sequence, when the export sends none", () => {
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "session.id", value: { stringValue: "s-1" } },
                    { key: "cost_usd", value: { doubleValue: 0.01 } },
                    { key: "event.timestamp", value: { stringValue: "2026-08-18T17:04:39.258Z" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const [record] = mapOtlpLogsToSinkRecords(payload, [CLAUDE_VENDOR]);
    expect(record.event_timestamp).toBe("2026-08-18T17:04:39.258Z");
    expect(record.event_sequence).toBeUndefined();
    expect(Object.keys(record)).not.toContain("event_sequence");
  });

  it("drops every named identity attribute, by name and by value", () => {
    const [record] = mapOtlpLogsToSinkRecords(logsPayload, [CLAUDE_VENDOR]);
    const keys = Object.keys(record);
    for (const forbidden of [
      "user_email",
      "user.email",
      "user_account_id",
      "user_account_uuid",
      "organization_id",
      "organization.id",
      "terminal_type",
      "terminal.type",
      "request_id",
      "client_request_id",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    const serialized = JSON.stringify(record);
    for (const value of NEVER_KEPT_VALUES) {
      expect(serialized).not.toContain(value);
    }
  });

  it("drops an attribute the mapper was never told about, without knowing it exists", () => {
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "session.id", value: { stringValue: "s-1" } },
                    { key: "cost_usd", value: { doubleValue: 1.5 } },
                    { key: "vendor.mystery_field", value: { stringValue: "surprise" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const [record] = mapOtlpLogsToSinkRecords(payload, [CLAUDE_VENDOR]);
    expect(JSON.stringify(record)).not.toContain("surprise");
    expect(JSON.stringify(record)).not.toContain("mystery_field");
  });

  it("maps a second tool's identity by field name alone — no branch on which tool it is", () => {
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "conversation.id", value: { stringValue: "conv-abc123" } },
                    { key: "cost_usd", value: { doubleValue: 0.02 } },
                    { key: "model", value: { stringValue: "gpt-5-codex" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const codexVendor: TelemetryVendorIdentity = { identityAttribute: "conversation.id" };
    const [record] = mapOtlpLogsToSinkRecords(payload, [codexVendor]);
    expect(record.vendor_id).toBe("conv-abc123");
    expect(record.vendor_field).toBe("conversation.id");
    expect(record.turn_id).toBeUndefined();
  });

  // agent.name rides only on a subagent's own request, which the main capture has none of.
  // A second real capture rather than a hand-written record: the acceptance criterion asks
  // that every allowlisted field survive a *captured* payload, and a fabricated one would
  // prove the mapper against a shape nobody has seen.
  it("keeps agent_name, from a captured subagent turn", () => {
    const subagentPayload = loadFixture("otlp-logs-claude-code-subagent.json");
    const records = mapOtlpLogsToSinkRecords(subagentPayload, [CLAUDE_VENDOR]);

    const subagent = records.find((record) => record.agent_name !== undefined);
    expect(subagent?.agent_name).toBe("general-purpose");
    expect(subagent?.query_source).toBe("agent:builtin:general-purpose");
    expect(records.every((record) => record.turn_id === subagent?.turn_id)).toBe(true);
  });

  // Production never passes one vendor: `declaredVendorIdentities()` hands the mapper every
  // registered tool's identity at once. Tested one at a time, the "first match wins" loop
  // is never exercised — nor is the risk that a non-matching vendor's turn attribute leaks.
  it("resolves the matching tool when several vendors are offered at once", () => {
    const codexVendor: TelemetryVendorIdentity = { identityAttribute: "conversation.id" };
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "conversation.id", value: { stringValue: "codex-session" } },
                    { key: "prompt.id", value: { stringValue: "not-a-codex-turn" } },
                    { key: "cost_usd", value: { doubleValue: 0.25 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const [record] = mapOtlpLogsToSinkRecords(payload, [CLAUDE_VENDOR, codexVendor]);
    expect(record.vendor_field).toBe("conversation.id");
    expect(record.vendor_id).toBe("codex-session");
    expect(record.turn_id).toBeUndefined();
    expect(record.turn_field).toBeUndefined();
  });

  it("drops a billed-looking record when the tool it came from declares no matching identity", () => {
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "session.id", value: { stringValue: "s-1" } },
                    { key: "model", value: { stringValue: "claude-sonnet-5" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // Identity resolves, but nothing was billed: a lifecycle event, not a request.
    expect(mapOtlpLogsToSinkRecords(payload, [CLAUDE_VENDOR])).toHaveLength(0);
  });

  it("drops a log record with no identity attribute the mapper can resolve", () => {
    const payload = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            { logRecords: [{ attributes: [{ key: "cost_usd", value: { doubleValue: 1 } }] }] },
          ],
        },
      ],
    };
    expect(mapOtlpLogsToSinkRecords(payload, [CLAUDE_VENDOR])).toHaveLength(0);
  });
});

describe("mapOtlpMetricsToSinkRecords()", () => {
  const metricsPayload = loadFixture("otlp-metrics-claude-code.json");

  it("maps active time from a real captured metrics payload — held on no log record", () => {
    const records = mapOtlpMetricsToSinkRecords(metricsPayload, [CLAUDE_VENDOR], CLAUDE_MEASURES);
    const activeTime = records.find((r) => r.active_time_s !== undefined);
    expect(activeTime?.active_time_s).toBe(9.714);
    expect(activeTime?.kind).toBe("session");
    expect(activeTime?.turn_id).toBeUndefined();
  });

  it("produces one line per datapoint, never merging token subtypes", () => {
    // Asserting the values alone would pass against a single merged record carrying them
    // all, which is the exact defect this name promises to catch.
    const records = mapOtlpMetricsToSinkRecords(metricsPayload, [CLAUDE_VENDOR], CLAUDE_MEASURES);
    expect(records.find((r) => r.input_tokens !== undefined)?.input_tokens).toBe(2);
    expect(records.find((r) => r.output_tokens !== undefined)?.output_tokens).toBe(4);
    expect(records.find((r) => r.cache_read_tokens !== undefined)?.cache_read_tokens).toBe(43841);
    expect(records.find((r) => r.cache_creation_tokens !== undefined)?.cache_creation_tokens).toBe(
      307
    );
    expect(records.find((r) => r.cost_usd !== undefined)?.cost_usd).toBeCloseTo(0.0150603, 6);

    const inputLine = records.find((r) => r.input_tokens !== undefined);
    const outputLine = records.find((r) => r.output_tokens !== undefined);
    expect(inputLine).not.toBe(outputLine);
    expect(inputLine?.output_tokens).toBeUndefined();
  });

  it("is distinguishable from a per-turn line at read time — every metrics line is kind session", () => {
    const records = mapOtlpMetricsToSinkRecords(metricsPayload, [CLAUDE_VENDOR], CLAUDE_MEASURES);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.kind === "session")).toBe(true);
  });

  it("drops named identity attributes from metrics too", () => {
    const records = mapOtlpMetricsToSinkRecords(metricsPayload, [CLAUDE_VENDOR], CLAUDE_MEASURES);
    const serialized = JSON.stringify(records);
    for (const value of NEVER_KEPT_VALUES) {
      expect(serialized).not.toContain(value);
    }
    expect(records.every((r) => r.user_id !== undefined)).toBe(true);
  });

  it("drops a metric name no session measure declares", () => {
    const payload = {
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "claude_code.session.count",
                  sum: {
                    dataPoints: [
                      {
                        attributes: [{ key: "session.id", value: { stringValue: "s-1" } }],
                        asDouble: 1,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(mapOtlpMetricsToSinkRecords(payload, [CLAUDE_VENDOR], CLAUDE_MEASURES)).toHaveLength(0);
  });
});

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
    const url = new URL("../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
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

  it("carries provenance for both routes, on the same fixture", () => {
    const url = new URL("../../fixtures/telemetry-sink/expected.jsonl", import.meta.url);
    const lines = readFileSync(fileURLToPath(url), "utf8").trim().split("\n");
    const records = lines.map(parseTelemetrySinkLine);
    expect(records.some((r) => r.provenance === "export")).toBe(true);
    expect(records.some((r) => r.provenance === "local-read")).toBe(true);
  });
});
