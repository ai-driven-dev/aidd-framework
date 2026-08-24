import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapCopilotEventsToSinkRecords } from "../../../src/domain/formats/copilot-events.js";

const SESSION = "33333333-3333-4333-8333-333333333333";
const EMPTY_SESSION = "44444444-4444-4444-8444-444444444444";

// Both fixtures are real, redacted excerpts of a captured `@github/copilot@1.0.80` file —
// system.message, user.message, assistant.message and every reasoning field stripped, per
// #697's acceptance criterion. See readers.cjs's own copy of this measurement for the
// prose, and copilot-events.ts's own header comment for the arithmetic it rests on.
function loadFixture(relativePath: string): string {
  const url = new URL(`../../fixtures/local-cost/${relativePath}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const FULL_PATH = `.copilot/session-state/${SESSION}/events.jsonl`;
const EMPTY_PATH = `.copilot/session-state/${EMPTY_SESSION}/events.jsonl`;

describe("mapCopilotEventsToSinkRecords", () => {
  it("yields one kind: session record, from session.shutdown's own tokenDetails", () => {
    const records = mapCopilotEventsToSinkRecords(loadFixture(FULL_PATH), SESSION);

    expect(records).toEqual([
      {
        kind: "session",
        vendor_id: SESSION,
        vendor_field: "sessionId",
        turn_id: "99ccf9e7-b3ac-4145-a622-31852ec698cb",
        turn_field: "id",
        event_timestamp: "2026-08-21T14:07:49.286Z",
        input_tokens: 10,
        output_tokens: 42,
        cache_read_tokens: 0,
        cache_creation_tokens: 21070,
      },
    ]);
  });

  it("stamps the vendor id it was given, never one read off the file's own content", () => {
    // The file's own session.start names SESSION; asking for a different id still gets
    // that different id back — the file only ever confirms it holds *a* session, never
    // which one, and the caller's own answer is the one that must win. See the header
    // comment on copilot-events.ts for why the two could disagree at all.
    const records = mapCopilotEventsToSinkRecords(loadFixture(FULL_PATH), "some-other-id");

    expect(records[0]?.vendor_id).toBe("some-other-id");
  });

  it("still yields a record from a truncated file with no session.start line at all", () => {
    // A capture missing its first line - a partial copy, a rotated file - carries no
    // session.start to (wrongly) fall back to. Reading identity from the caller's own
    // argument rather than from file content is what keeps this case from silently
    // dropping the record - see the header comment on copilot-events.ts.
    const noSessionStart = loadFixture(FULL_PATH)
      .split("\n")
      .filter((line) => !line.includes('"session.start"'))
      .join("\n");

    const records = mapCopilotEventsToSinkRecords(noSessionStart, SESSION);

    expect(records).toHaveLength(1);
    expect(records[0]?.vendor_id).toBe(SESSION);
  });

  it("never reads modelMetrics.usage.inputTokens, which is inclusive of the cache figure", () => {
    // Measured: 10 (tokenDetails.input) + 21070 (cache_write) = 21080 (usage.inputTokens).
    const [record] = mapCopilotEventsToSinkRecords(loadFixture(FULL_PATH), SESSION);

    expect(record?.input_tokens).not.toBe(21080);
  });

  it("never carries cost_usd — totalPremiumRequests is a multiplier, not a currency", () => {
    const [record] = mapCopilotEventsToSinkRecords(loadFixture(FULL_PATH), SESSION);

    expect(record && "cost_usd" in record).toBe(false);
  });

  it("never names a model — currentModel is only ever the session's last model", () => {
    const [record] = mapCopilotEventsToSinkRecords(loadFixture(FULL_PATH), SESSION);

    expect(record && "model" in record).toBe(false);
  });

  it("yields nothing, not a record of zeros, when shutdown carried no tokenDetails", () => {
    const records = mapCopilotEventsToSinkRecords(loadFixture(EMPTY_PATH), EMPTY_SESSION);

    expect(records).toEqual([]);
  });

  it("yields nothing for a session that never shut down", () => {
    const noShutdown = loadFixture(FULL_PATH)
      .split("\n")
      .filter((line) => !line.includes('"session.shutdown"'))
      .join("\n");

    expect(mapCopilotEventsToSinkRecords(noShutdown, SESSION)).toEqual([]);
  });

  it("turns red rather than storing a zero when tokenDetails' own field is renamed", () => {
    const moved = loadFixture(FULL_PATH).replaceAll("tokenCount", "token_count");

    expect(mapCopilotEventsToSinkRecords(moved, SESSION)).toEqual([]);
  });

  it("touches no filesystem — two strings in, an array out", () => {
    expect(typeof mapCopilotEventsToSinkRecords).toBe("function");
    expect(mapCopilotEventsToSinkRecords.length).toBe(2);
  });
});
