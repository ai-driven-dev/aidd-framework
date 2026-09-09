import { readFileSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createCodexRolloutAccumulator,
  mapCodexRolloutToSinkRecords,
} from "../../../../../src/contexts/telemetry/domain/formats/codex-rollout.js";
import { CODEX_ROLLOUT_LOCATION } from "../../../../../src/contexts/tools/domain/profiles/codex/codex-transcript-location.js";
import { journalRecord } from "../../../../helpers/telemetry-journal-hook.js";

const TARGET_ID = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const TARGET_PARENT = "019f69d0-9e1f-7951-86c9-ddb23cfd51f4";

// Real, redacted rollout excerpts: target.jsonl is a resumed session (session_meta.id !==
// session_id), parent.jsonl its own parent, a fresh session where the two agree.
function loadFixture(relativePath: string): string {
  const url = new URL(`../../../../fixtures/local-cost/${relativePath}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const TARGET_PATH = `.codex/sessions/2026/07/29/rollout-2026-07-29T17-12-26-${TARGET_ID}.jsonl`;
const PARENT_PATH = `.codex/sessions/2026/07/16/rollout-2026-07-16T09-25-07-${TARGET_PARENT}.jsonl`;

describe("mapCodexRolloutToSinkRecords", () => {
  it("yields one record per turn, its counters summed from the increments, never the totals", () => {
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    // Real captured `last_token_usage` increments for this turn; summing `total_token_usage`
    // instead would give an input figure over 8x too large.
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      kind: "request",
      vendor_id: TARGET_ID,
      vendor_field: "session_meta.id",
      turn_id: "019fae6f-2084-7d63-b3c1-3d45d0864fe9",
      turn_field: "turn_id",
      model: "gpt-5.6-sol",
      effort: "high",
      event_timestamp: "2026-07-29T15:12:27.889Z",
      input_tokens: 8898,
      output_tokens: 827,
      cache_read_tokens: 65792,
      cache_creation_tokens: 0,
    });
    expect(records[1]).toEqual({
      kind: "request",
      vendor_id: TARGET_ID,
      vendor_field: "session_meta.id",
      turn_id: "019fae71-ae8b-7850-a982-78d7cd9dba52",
      turn_field: "turn_id",
      model: "gpt-5.6-sol",
      effort: "high",
      event_timestamp: "2026-07-29T15:15:13.692Z",
      input_tokens: 5032,
      output_tokens: 3550,
      cache_read_tokens: 99840,
      cache_creation_tokens: 0,
    });
  });

  it("resolves vendor_id from session_meta.id, not session_meta.session_id", () => {
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    expect(records.every((r) => r.vendor_id === TARGET_ID)).toBe(true);
    expect(records.every((r) => r.vendor_id !== TARGET_PARENT)).toBe(true);
  });

  it("carries the model and effort from turn_context, not from the counted event", () => {
    // `token_count`'s own `info` carries no model and no effort, so a mapper reading either
    // from there would leave them undefined on this fixture.
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    expect(records.every((r) => r.model === "gpt-5.6-sol" && r.effort === "high")).toBe(true);
  });

  it("omits a counter never observed in any event of the turn, rather than summing a zero", () => {
    // The parent fixture's events never carry cache_write_input_tokens at all, a real
    // older-CLI shape: the record must have no key rather than a fabricated 0.
    const [record] = mapCodexRolloutToSinkRecords(loadFixture(PARENT_PATH));

    expect(record).toEqual({
      kind: "request",
      vendor_id: TARGET_PARENT,
      vendor_field: "session_meta.id",
      turn_id: "019f69d1-8dcc-7272-a9eb-523ef9976475",
      turn_field: "turn_id",
      model: "gpt-5.5",
      effort: "high",
      event_timestamp: "2026-07-16T07:26:08.898Z",
      input_tokens: 25073,
      output_tokens: 1148,
      cache_read_tokens: 22272,
    });
    expect("cache_creation_tokens" in record).toBe(false);
  });

  it("turns red rather than storing a zero when last_token_usage is renamed", () => {
    const moved = loadFixture(TARGET_PATH).replaceAll("last_token_usage", "lastTokenUsage");

    expect(mapCodexRolloutToSinkRecords(moved)).toHaveLength(0);
  });

  // Without a moment a Codex record falls inside no step interval, and the journal is the
  // only step source Codex has; the rollout carries that moment on its `turn_context` line.
  it("carries the turn's own start, so a journal interval can reach it", () => {
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.event_timestamp).toBeDefined();
    }
    expect(records[0].event_timestamp).toBe("2026-07-29T15:12:27.889Z");
  });

  it("takes the moment from turn_context, not from a counted event inside the turn", () => {
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    // The `token_count` events of a turn arrive after it opens; a record covering the whole
    // turn must not claim a moment inside it.
    const [first] = records;
    expect(first.event_timestamp).toBe("2026-07-29T15:12:27.889Z");
    expect(first.turn_id).toBe("019fae6f-2084-7d63-b3c1-3d45d0864fe9");
  });

  it("touches no filesystem — a string in, an array out", () => {
    expect(typeof mapCodexRolloutToSinkRecords).toBe("function");
    expect(mapCodexRolloutToSinkRecords.length).toBe(1);
  });
});

describe("createCodexRolloutAccumulator", () => {
  it("streamed one line at a time, matches the whole-content mapping", () => {
    const whole = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));
    const accumulator = createCodexRolloutAccumulator();
    for (const line of loadFixture(TARGET_PATH).split("\n")) accumulator.push(line);

    expect(accumulator.build()).toEqual(whole);
  });
});

describe("CODEX_ROLLOUT_LOCATION", () => {
  it("accepts a rollout for the id the journal hook derives from the same path", () => {
    // The hook writes vendor_id and this location resolves the file to read; they agree only
    // if both take the rollout's own id off the filename, and they can share no code.
    for (const path of [TARGET_PATH, PARENT_PATH]) {
      const derived = journalRecord.codexSessionIdFromTranscriptPath(path);

      expect(derived).toBeDefined();
      expect(CODEX_ROLLOUT_LOCATION.matches(path.split("/").join(sep), derived as string)).toBe(
        true
      );
    }
  });

  it("derives the resumed rollout's own id, never its parent's", () => {
    // On a resumed session `session_meta.session_id` holds the parent's id, so a vendor_id
    // written from it joins to nothing — 38% of measured Codex sessions are resumed.
    expect(journalRecord.codexSessionIdFromTranscriptPath(TARGET_PATH)).toBe(TARGET_ID);
    expect(journalRecord.codexSessionIdFromTranscriptPath(TARGET_PATH)).not.toBe(TARGET_PARENT);
  });

  it("derives nothing from a path that is not a rollout, so the payload's own spelling is used", () => {
    expect(journalRecord.codexSessionIdFromTranscriptPath(undefined)).toBeUndefined();
    expect(journalRecord.codexSessionIdFromTranscriptPath("/tmp/notes.jsonl")).toBeUndefined();
    expect(
      journalRecord.codexSessionIdFromTranscriptPath("rollout-no-uuid-here.jsonl")
    ).toBeUndefined();
  });

  it("falls back to the payload's session_id when no transcript path is carried", () => {
    expect(journalRecord.readSessionId("codex", { session_id: "fallback-id" })).toBe("fallback-id");
    expect(
      journalRecord.readSessionId("codex", {
        session_id: "parent-id",
        transcript_path: TARGET_PATH,
      })
    ).toBe(TARGET_ID);
  });
});

// Measured on real rollouts: the last `token_count` of a turn is sometimes re-emitted
// verbatim, the same `last_token_usage` twice while `total_token_usage` does not move.
describe("a token_count re-emitted with an unmoved cumulative", () => {
  const usage = (input: number, cached: number, output: number) => ({
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: output,
  });
  const tokenCount = (last: object, total: object) =>
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-08-05T09:42:40.000Z",
      payload: { type: "token_count", info: { last_token_usage: last, total_token_usage: total } },
    });

  const rollout = [
    JSON.stringify({ type: "session_meta", payload: { id: "s-1" } }),
    JSON.stringify({
      type: "turn_context",
      timestamp: "2026-08-05T09:42:34.000Z",
      payload: { turn_id: "t-1", model: "gpt-5.4", effort: "high" },
    }),
    tokenCount(usage(19468, 4000, 100), usage(19468, 4000, 100)),
    tokenCount(usage(22086, 5000, 120), usage(41554, 9000, 220)),
    // The re-emission: identical increment, and a cumulative that has not moved.
    tokenCount(usage(22086, 5000, 120), usage(41554, 9000, 220)),
  ].join("\n");

  it("counts it once, because a cumulative that has not moved was never billed", () => {
    const records = mapCodexRolloutToSinkRecords(rollout);

    expect(records).toHaveLength(1);
    // input is made exclusive of cache: (19468-4000) + (22086-5000) = 32554.
    expect(records[0]?.input_tokens).toBe(32554);
    expect(records[0]?.cache_read_tokens).toBe(9000);
    expect(records[0]?.output_tokens).toBe(220);
    // And it reconciles with the cumulative the tool itself states at the turn's end.
    expect((records[0]?.input_tokens ?? 0) + (records[0]?.cache_read_tokens ?? 0)).toBe(41554);
  });

  it("still counts an event that states no cumulative at all, rather than assuming nothing happened", () => {
    const withoutTotal = [
      JSON.stringify({ type: "session_meta", payload: { id: "s-2" } }),
      JSON.stringify({
        type: "turn_context",
        timestamp: "2026-08-05T09:42:34.000Z",
        payload: { turn_id: "t-2" },
      }),
      tokenCount(usage(100, 0, 10), usage(100, 0, 10)),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "token_count", info: { last_token_usage: usage(100, 0, 10) } },
      }),
    ].join("\n");

    expect(mapCodexRolloutToSinkRecords(withoutTotal)[0]?.output_tokens).toBe(20);
  });
});
