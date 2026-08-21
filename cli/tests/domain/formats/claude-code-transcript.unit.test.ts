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
    // counters) and three real API calls — one of them logged as two JSONL lines (a
    // `thinking` block then a `tool_use` block) sharing one `requestId` and `message.id`.
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      kind: "request",
      vendor_id: SID,
      vendor_field: "sessionId",
      turn_id: "req_011Cdk8FcLJwNkFzLNRR8BpN",
      turn_field: "requestId",
      model: "claude-sonnet-5",
      effort: "high",
      event_timestamp: "2026-08-05T19:07:12.838Z",
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
});
