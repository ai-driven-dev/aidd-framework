import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createCodexRolloutAccumulator,
  mapCodexRolloutToSinkRecords,
} from "../../../src/domain/formats/codex-rollout.js";

const TARGET_ID = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const TARGET_PARENT = "019f69d0-9e1f-7951-86c9-ddb23cfd51f4";

// Both fixtures are real, redacted rollout excerpts captured 2026-08-20 on Codex CLI
// 0.145.0-alpha.27 — target.jsonl is a resumed session (session_meta.id !== session_id),
// parent.jsonl is that resumed session's own parent (a fresh session, where the two agree).
// See codex-rollout.ts's header comment for the full measurement.
function loadFixture(relativePath: string): string {
  const url = new URL(`../../fixtures/local-cost/${relativePath}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const TARGET_PATH = `.codex/sessions/2026/07/29/rollout-2026-07-29T17-12-26-${TARGET_ID}.jsonl`;
const PARENT_PATH = `.codex/sessions/2026/07/16/rollout-2026-07-16T09-25-07-${TARGET_PARENT}.jsonl`;

describe("mapCodexRolloutToSinkRecords", () => {
  it("yields one record per turn, its counters summed from the increments, never the totals", () => {
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    // Real captured `last_token_usage` events for this turn: {22229,20224,0,231},
    // {24692,21248,0,206}, {27769,24320,0,390} (input, cached, cache_write, output).
    // Summing `total_token_usage` instead (22229 → 46921 → 74690) would give an
    // input figure over 8x too large for this one turn.
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
    // token_count's own `info` has no model and no effort at all — if the mapper read
    // either from there, this fixture (which never puts them there) would leave them
    // undefined instead of "gpt-5.6-sol" / "high".
    const records = mapCodexRolloutToSinkRecords(loadFixture(TARGET_PATH));

    expect(records.every((r) => r.model === "gpt-5.6-sol" && r.effort === "high")).toBe(true);
  });

  it("omits a counter never observed in any event of the turn, rather than summing a zero", () => {
    // The parent fixture's events never carry cache_write_input_tokens at all (a real,
    // older-CLI shape) — the resulting record must have no cache_creation_tokens key,
    // not a fabricated 0.
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

  // Without a moment, a Codex record cannot fall inside any step interval, so the journal
  // — the only step source Codex has — could never attribute it. The rollout carries the
  // moment on the `turn_context` line; taking it is what makes the fallback reachable.
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
