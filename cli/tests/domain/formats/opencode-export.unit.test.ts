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
  // The comparison opencode-export.ts's own header named as missing: a large `cache.read`
  // beside `input`, for a provider that is not Anthropic. Captured live 2026-09-06 from
  // `opencode export --sanitize`, opencode 1.14.20, providerID "opencode", modelID
  // "ling-3.0-flash-fin-free" - three billed turns of one session, cache genuinely
  // exercised across them. `input` falls from 28242 to 269 as `cache.read` climbs from
  // 640 to 28928: an `input` that already counted the cached tokens could not shrink that
  // way. OpenCode's own `total` confirms it by arithmetic on every turn -
  // `total == input + output + reasoning + cache.read + cache.write` - which only holds if
  // the counters are disjoint.
  it("reads a non-Anthropic provider's counters as disjoint, the comparison no capture held", () => {
    const records = mapOpencodeExportToSinkRecords(
      loadFixture("opencode-export-non-anthropic-cache.json"),
      "ses_test_non_anthropic"
    );

    expect(
      records.map((record) => ({
        input: record.input_tokens,
        output: record.output_tokens,
        cacheRead: record.cache_read_tokens,
        cacheCreation: record.cache_creation_tokens,
      }))
    ).toEqual([
      { input: 28242, output: 193, cacheRead: 640, cacheCreation: 0 },
      { input: 269, output: 137, cacheRead: 28928, cacheCreation: 0 },
      { input: 196, output: 56, cacheRead: 29184, cacheCreation: 0 },
    ]);
    expect(records.every((record) => record.model === "ling-3.0-flash-fin-free")).toBe(true);
  });

  it("yields one record per billed message, by value, under the stored field names", () => {
    const records = mapOpencodeExportToSinkRecords(loadFixture("opencode-export.json"), SESSION_ID);

    // The fixture holds 5 user turns (no `tokens`), 3 billed assistant turns (`tokens` with a
    // `total`), and 1 assistant turn OpenCode created but never billed (`tokens` present, every
    // counter 0, no `total`) — only the 3 billed turns are counted messages.
    expect(records).toHaveLength(3);
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
    ]);
  });

  it("yields no record for a message OpenCode created but never billed — no total, even though tokens is present and every counter reads 0", () => {
    const payload = {
      messages: [
        {
          info: {
            role: "assistant",
            id: "msg_aborted",
            sessionID: SESSION_ID,
            time: { created: 1773638379047 },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
        },
      ],
    };

    expect(mapOpencodeExportToSinkRecords(payload, SESSION_ID)).toEqual([]);
  });

  it("keeps the record for a billed message that genuinely used 0 tokens — total is present, even at 0", () => {
    const payload = {
      messages: [
        {
          info: {
            role: "assistant",
            id: "msg_zero_billed",
            sessionID: SESSION_ID,
            time: { created: 1773638379047 },
            tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
        },
      ],
    };

    expect(mapOpencodeExportToSinkRecords(payload, SESSION_ID)).toEqual([
      {
        kind: "request",
        vendor_id: SESSION_ID,
        vendor_field: "sessionID",
        turn_id: "msg_zero_billed",
        turn_field: "id",
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
