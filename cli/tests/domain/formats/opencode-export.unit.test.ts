import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapOpencodeExportToSinkRecords } from "../../../src/domain/formats/opencode-export.js";

const SESSION_ID = "ses_test_read";

// opencode-export.json is a real `opencode export <sessionID> --sanitize` capture (opencode
// 1.14.20, 2026-08-20), mechanically trimmed to `{info, messages: [{info}, ...]}` — `parts`
// dropped, since the mapper under test reads only `messages[].info` and `--sanitize` had
// already redacted everything `parts` still carried. No value inside `info` was hand-edited.
function loadFixture(name: string): unknown {
  const url = new URL(`../../fixtures/telemetry-sink/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

describe("mapOpencodeExportToSinkRecords", () => {
  it("yields one record per counted message, by value, under the stored field names", () => {
    const records = mapOpencodeExportToSinkRecords(loadFixture("opencode-export.json"), SESSION_ID);

    // The fixture holds 5 user turns (no `tokens`) and 4 assistant turns (`tokens` present,
    // one of them all-zero) — only the 4 assistant turns are counted messages.
    expect(records).toHaveLength(4);
    expect(records).toEqual([
      {
        kind: "request",
        vendor_id: SESSION_ID,
        vendor_field: "sessionID",
        turn_id: "msg_cf515b1b20011NzmARPrSpI1lW",
        turn_field: "id",
        model: "claude-sonnet-4-6",
        event_timestamp: "2026-03-16T05:19:25.618Z",
        input_tokens: 3,
        output_tokens: 115,
        cache_read_tokens: 43639,
        cache_creation_tokens: 3141,
      },
      {
        kind: "request",
        vendor_id: SESSION_ID,
        vendor_field: "sessionID",
        turn_id: "msg_cf515c482001XcMRpKRNVBj0v9",
        turn_field: "id",
        model: "claude-sonnet-4-6",
        event_timestamp: "2026-03-16T05:19:30.434Z",
        input_tokens: 1,
        output_tokens: 238,
        cache_read_tokens: 46780,
        cache_creation_tokens: 176,
      },
      {
        kind: "request",
        vendor_id: SESSION_ID,
        vendor_field: "sessionID",
        turn_id: "msg_cf515d659001v8AyNXNm4y69T8",
        turn_field: "id",
        model: "claude-sonnet-4-6",
        event_timestamp: "2026-03-16T05:19:35.001Z",
        input_tokens: 1,
        output_tokens: 161,
        cache_read_tokens: 46956,
        cache_creation_tokens: 4074,
      },
      {
        kind: "request",
        vendor_id: SESSION_ID,
        vendor_field: "sessionID",
        turn_id: "msg_cf515e6270019kLPJWNgcnoVSu",
        turn_field: "id",
        model: "claude-sonnet-4-6",
        event_timestamp: "2026-03-16T05:19:39.047Z",
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      },
    ]);
  });

  it("sets vendor_id from the sessionId argument, never from the payload's own id", () => {
    const records = mapOpencodeExportToSinkRecords(loadFixture("opencode-export.json"), "s-other");

    expect(records.every((r) => r.vendor_id === "s-other")).toBe(true);
  });

  it("never reads info.cost — it is 0 with no established denomination", () => {
    const records = mapOpencodeExportToSinkRecords(loadFixture("opencode-export.json"), SESSION_ID);

    for (const record of records) {
      expect(record.cost_usd).toBeUndefined();
    }
  });

  it("yields no record for a message with no counters, never an invented zero", () => {
    const payload = { messages: [{ info: { role: "user", id: "msg_1" } }] };

    expect(mapOpencodeExportToSinkRecords(payload, SESSION_ID)).toEqual([]);
  });

  it("returns nothing for an empty or malformed payload rather than throwing", () => {
    expect(mapOpencodeExportToSinkRecords({}, SESSION_ID)).toEqual([]);
    expect(mapOpencodeExportToSinkRecords(null, SESSION_ID)).toEqual([]);
    expect(mapOpencodeExportToSinkRecords({ messages: [] }, SESSION_ID)).toEqual([]);
  });
});
