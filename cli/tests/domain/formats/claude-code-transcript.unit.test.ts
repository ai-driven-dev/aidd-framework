import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createClaudeCodeTranscriptAccumulator,
  mapClaudeCodeTranscriptToSinkRecords,
} from "../../../src/domain/formats/claude-code-transcript.js";

const SID = "22222222-2222-4222-8222-222222222222";

// Both fixtures are real, redacted excerpts captured 2026-08-20 — main.jsonl from Claude
// Code 2.1.229, subagent.jsonl from 2.1.232 — see the local-cost fixtures README-style
// header comment in claude-code-transcript.ts for the full measurement.
function loadFixture(relativePath: string): string {
  const url = new URL(`../../fixtures/local-cost/${relativePath}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const MAIN_PATH = `.claude/projects/fake-project/${SID}.jsonl`;
const SUBAGENT_PATH = `.claude/projects/fake-project/${SID}/subagents/agent-aa81cdef3bb58820c.jsonl`;

describe("mapClaudeCodeTranscriptToSinkRecords", () => {
  it("yields one record per real assistant turn, by value, under the stored field names", () => {
    const records = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));

    // The fixture holds a queue-operation, a user turn, a tool_result turn (none carry
    // counters), one `<synthetic>` notice Claude Code wrote itself, and three real API
    // calls — one of them logged as two JSONL lines (a `thinking` block then a `tool_use`
    // block) sharing one `requestId` and `message.id`.
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      kind: "request",
      vendor_id: SID,
      vendor_field: "sessionId",
      turn_id: "req_011Cdk8FcLJwNkFzLNRR8BpN",
      turn_field: "requestId",
      model: "claude-sonnet-5",
      effort: "high",
      // The completed line's moment, not the one that opened the message: a billed request
      // happened when it finished, and that is also the moment its day row is keyed on.
      event_timestamp: "2026-08-05T19:07:15.789Z",
      input_tokens: 2,
      output_tokens: 184,
      cache_read_tokens: 24436,
      cache_creation_tokens: 18705,
    });
    expect(records[1]).toMatchObject({
      turn_id: "req_011Cdk8GAKucdYdLHAXJU365",
      output_tokens: 191,
    });
    expect(records[2]).toMatchObject({
      turn_id: "req_011Cdk8GZ2QZU7DF2sXbhWSc",
      output_tokens: 174,
    });
  });

  it("collapses two lines sharing one requestId into a single record, never doubling the call", () => {
    const records = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));

    const forFirstCall = records.filter((r) => r.turn_id === "req_011Cdk8FcLJwNkFzLNRR8BpN");
    expect(forFirstCall).toHaveLength(1);
  });

  it("reads a subagent's own transcript file, attributing its work via agent_name", () => {
    const records = mapClaudeCodeTranscriptToSinkRecords(loadFixture(SUBAGENT_PATH));

    expect(records).toEqual([
      {
        kind: "request",
        vendor_id: SID,
        vendor_field: "sessionId",
        turn_id: "req_011Ce2HDaNo7CVCZKrT8yryX",
        turn_field: "requestId",
        model: "claude-opus-5",
        effort: "high",
        event_timestamp: "2026-08-14T07:54:15.988Z",
        agent_name: "Explore",
        // A real, unflagged fact this capture carries — task 1's own field, read straight
        // off the transcript with no journal beside it. No `step_plugin`: this line carries
        // no `attributionPlugin` at all, and one is never invented alongside a real skill.
        step: "probe-echo",
        input_tokens: 2,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_creation_tokens: 20212,
      },
    ]);
  });

  // Task 1's own criterion: the field's absence is never read as "no skill ran" — it is
  // simply not asserted at all. Built by removing the real fixture's own attributionSkill
  // key rather than hand-writing a payload, so this exercises the same real line shape the
  // presence test above does, differing only in the one field under test.
  it("carries no step at all when a line has no attributionSkill, never asserting none ran", () => {
    const withoutAttribution = loadFixture(SUBAGENT_PATH).replace(
      /"attributionSkill":\s*"[^"]*",?/,
      ""
    );

    const records = mapClaudeCodeTranscriptToSinkRecords(withoutAttribution);

    expect(records).toHaveLength(1);
    expect(records[0] && "step" in records[0]).toBe(false);
    expect(records[0] && "step_plugin" in records[0]).toBe(false);
  });

  it("keeps a subagent's counters distinct from the main line's — never merged into one figure", () => {
    const mainRecords = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));
    const subagentRecords = mapClaudeCodeTranscriptToSinkRecords(loadFixture(SUBAGENT_PATH));

    const turnIds = new Set([...mainRecords, ...subagentRecords].map((r) => r.turn_id));
    expect(turnIds.size).toBe(mainRecords.length + subagentRecords.length);
    expect(subagentRecords[0]?.agent_name).toBe("Explore");
    expect(mainRecords.every((r) => r.agent_name === undefined)).toBe(true);
  });

  it("skips a half-written final line rather than throwing", () => {
    const content = loadFixture(MAIN_PATH);
    const lastNewline = content.lastIndexOf("\n", content.length - 2);
    const truncated = `${content.slice(0, lastNewline + 1)}${content.slice(lastNewline + 1, -40)}`;

    expect(() => mapClaudeCodeTranscriptToSinkRecords(truncated)).not.toThrow();
    const records = mapClaudeCodeTranscriptToSinkRecords(truncated);
    expect(records).toHaveLength(2);
  });

  it("turns red rather than storing a zero when a counter field is renamed", () => {
    const moved = loadFixture(MAIN_PATH).replaceAll(
      "cache_creation_input_tokens",
      "cacheCreationInputTokens"
    );

    const records = mapClaudeCodeTranscriptToSinkRecords(moved);

    expect(records).toHaveLength(0);
  });

  // #686. The fixture's synthetic line is a captured one: a session-limit notice Claude
  // Code composed itself, `model: "<synthetic>"`, four zero counters, its own `requestId`.
  it("yields no record for a message the tool marked <synthetic>", () => {
    const records = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));

    expect(records.some((r) => r.model === "<synthetic>")).toBe(false);
    expect(records.some((r) => r.turn_id === "req_011CdhNELnGn9e99rkVfSSSc")).toBe(false);
    expect(records.map((r) => r.model)).toEqual([
      "claude-sonnet-5",
      "claude-sonnet-5",
      "claude-sonnet-5",
    ]);
  });

  // The filter is the marker, not the symptom: all-counters-zero on a real model is
  // improbable, not impossible, and dropping it would be a real call lost with nothing
  // downstream able to tell it was ever there.
  it("still yields a record for all-zero counters on a message that is not synthetic", () => {
    const line = JSON.stringify({
      type: "assistant",
      sessionId: SID,
      requestId: "req_all_zero",
      timestamp: "2026-08-05T19:08:00.000Z",
      message: {
        model: "claude-opus-5",
        id: "msg_all_zero",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });

    const records = mapClaudeCodeTranscriptToSinkRecords(line);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      turn_id: "req_all_zero",
      model: "claude-opus-5",
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    });
  });

  // A skipped line must not claim the key either: the next real call sharing it would
  // otherwise be dropped as a duplicate of something that was never a call.
  it("leaves the dedupe key free for a real call sharing the synthetic line's requestId", () => {
    const synthetic = JSON.stringify({
      type: "assistant",
      sessionId: SID,
      requestId: "req_shared",
      message: {
        model: "<synthetic>",
        id: "msg_shared",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    const real = JSON.stringify({
      type: "assistant",
      sessionId: SID,
      requestId: "req_shared",
      message: {
        model: "claude-opus-5",
        id: "msg_shared",
        usage: {
          input_tokens: 7,
          output_tokens: 9,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });

    const records = mapClaudeCodeTranscriptToSinkRecords(`${synthetic}\n${real}\n`);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ model: "claude-opus-5", output_tokens: 9 });
  });

  it("touches no filesystem — a string in, an array out", () => {
    expect(typeof mapClaudeCodeTranscriptToSinkRecords).toBe("function");
    expect(mapClaudeCodeTranscriptToSinkRecords.length).toBe(1);
  });
});

describe("createClaudeCodeTranscriptAccumulator", () => {
  it("streamed one line at a time, matches the whole-content mapping", () => {
    const whole = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));
    const accumulator = createClaudeCodeTranscriptAccumulator();
    for (const line of loadFixture(MAIN_PATH).split("\n")) accumulator.push(line);

    expect(accumulator.build()).toEqual(whole);
  });
  // Measured on 1,604 real transcripts: Claude Code writes a line when a message starts and
  // again when it completes, sharing one message.id. 25,702 of 83,626 groups differ, and the
  // last line's output_tokens is >= the first's in every one. Keeping the first kept the
  // placeholder and discarded 37.4% of all output tokens. The shape below is a real capture,
  // trimmed: same input and cache figures, output 3 -> 329.
  it("keeps the completed line for a message, not the placeholder that opened it", () => {
    const shared = {
      type: "assistant",
      sessionId: "11111111-1111-4111-8111-111111111111",
      requestId: "req_1",
      timestamp: "2026-08-23T10:00:00.000Z",
    };
    const opening = JSON.stringify({
      ...shared,
      message: {
        id: "msg_1",
        model: "claude-opus-5",
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 37477,
          cache_read_input_tokens: 0,
          output_tokens: 3,
        },
      },
    });
    const completed = JSON.stringify({
      ...shared,
      message: {
        id: "msg_1",
        model: "claude-opus-5",
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 37477,
          cache_read_input_tokens: 0,
          output_tokens: 329,
          output_tokens_details: { thinking_tokens: 49 },
        },
      },
    });

    const records = mapClaudeCodeTranscriptToSinkRecords(`${opening}\n${completed}\n`);

    expect(records).toHaveLength(1);
    expect(records[0].output_tokens).toBe(329);
    // Never summed: the two lines are one call restated, so the cache counter must not grow.
    expect(records[0].cache_creation_tokens).toBe(37477);
    expect(records[0].input_tokens).toBe(2);
  });
});
