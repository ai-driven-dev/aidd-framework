import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createClaudeCodeTranscriptAccumulator,
  mapClaudeCodeTranscriptToSinkRecords,
} from "../../../../../src/contexts/telemetry/domain/formats/claude-code-transcript.js";

const SID = "22222222-2222-4222-8222-222222222222";

// Both fixtures are real, redacted session excerpts; the measurement behind them is the header
// comment in `claude-code-transcript.ts`.
function loadFixture(relativePath: string): string {
  const url = new URL(`../../../../fixtures/local-cost/${relativePath}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const MAIN_PATH = `.claude/projects/fake-project/${SID}.jsonl`;
const SUBAGENT_PATH = `.claude/projects/fake-project/${SID}/subagents/agent-aa81cdef3bb58820c.jsonl`;

/** No transcript line carries both `requestId` and `promptId`: only `type: "user"` lines name a
 * prompt, and a billed line reaches one by following `parentUuid`. */
function chain(lines: readonly Record<string, unknown>[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

function assistantLine(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "assistant",
    sessionId: SID,
    requestId: "req_1",
    // All four counters or none: `readCounters` refuses a partial `usage` rather than
    // reading a missing one as zero, so a fixture with two of them yields no record at all.
    message: {
      id: "msg_1",
      model: "claude-opus-5",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    ...overrides,
  };
}

describe("mapClaudeCodeTranscriptToSinkRecords — the prompt a billed call belongs to", () => {
  it("follows parentUuid up to the user line that carries the prompt id", () => {
    const content = chain([
      { type: "user", uuid: "u1", promptId: "p-abc" },
      { type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: SID },
      assistantLine({ uuid: "a2", parentUuid: "a1" }),
    ]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_id).toBe("p-abc");
  });

  it("carries no prompt id when the chain reaches no line that names one", () => {
    const content = chain([assistantLine({ uuid: "a1" })]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_id).toBeUndefined();
  });

  // `attributionSkill` is exact where it appears and sparse where it does not, so its absence
  // is never the tool stating that no skill ran.
  it("names the skill a Skill call invoked inside the record's own prompt", () => {
    const content = chain([
      { type: "user", uuid: "u1", promptId: "p-abc" },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        sessionId: SID,
        message: {
          content: [{ type: "tool_use", name: "Skill", input: { skill: "aidd-dev:01-plan" } }],
        },
      },
      assistantLine({ uuid: "a2", parentUuid: "a1" }),
    ]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_skill).toBe("aidd-dev:01-plan");
  });

  it("names no skill for a prompt that invoked none", () => {
    const content = chain([
      { type: "user", uuid: "u1", promptId: "p-one" },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        sessionId: SID,
        message: {
          content: [{ type: "tool_use", name: "Skill", input: { skill: "aidd-dev:01-plan" } }],
        },
      },
      { type: "user", uuid: "u2", parentUuid: "a1", promptId: "p-two" },
      assistantLine({ uuid: "a2", parentUuid: "u2" }),
    ]);

    const records = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(records.at(-1)?.prompt_skill).toBeUndefined();
  });

  // The first, never the last: a prompt that invokes two skills invoked the second from
  // inside the first, and the prompt is named for the work it began.
  it("keeps the first skill a prompt invoked when it invoked more than one", () => {
    const content = chain([
      { type: "user", uuid: "u1", promptId: "p-abc" },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        sessionId: SID,
        message: {
          content: [
            { type: "tool_use", name: "Skill", input: { skill: "aidd-orchestrator:01-sdlc" } },
          ],
        },
      },
      {
        type: "assistant",
        uuid: "a2",
        parentUuid: "a1",
        sessionId: SID,
        message: {
          content: [{ type: "tool_use", name: "Skill", input: { skill: "aidd-pm:04-spec" } }],
        },
      },
      assistantLine({ uuid: "a3", parentUuid: "a2" }),
    ]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_skill).toBe("aidd-orchestrator:01-sdlc");
  });

  // Only a `Skill` call names a step; every other tool call is work inside the step already
  // running, so reading one as a step start would name a skill the prompt never invoked.
  it("ignores a tool call that is not a Skill call", () => {
    const content = chain([
      { type: "user", uuid: "u1", promptId: "p-abc" },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        sessionId: SID,
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { skill: "aidd-dev:01-plan" } }],
        },
      },
      assistantLine({ uuid: "a2", parentUuid: "a1" }),
    ]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_skill).toBeUndefined();
  });

  // A transcript is appended to by a live process and can be truncated mid-write; a parent
  // pointing at a line that never arrived must end the walk, not search forever.
  it("stops at a parent the transcript does not hold, rather than looping", () => {
    const content = chain([assistantLine({ uuid: "a1", parentUuid: "missing" })]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_id).toBeUndefined();
  });

  // This one fails by hanging, not by going red: the walk is synchronous, so a cycle wedges the
  // worker and no `--testTimeout` cuts it — removing the `seen` guard runs past two minutes.
  it("terminates on a chain that points back at itself", () => {
    const content = chain([
      { type: "user", uuid: "u1", parentUuid: "a1", promptId: undefined },
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
    ]);

    const [record] = mapClaudeCodeTranscriptToSinkRecords(content);

    expect(record?.prompt_id).toBeUndefined();
  });
});

describe("mapClaudeCodeTranscriptToSinkRecords", () => {
  it("yields one record per real assistant turn, by value, under the stored field names", () => {
    const records = mapClaudeCodeTranscriptToSinkRecords(loadFixture(MAIN_PATH));

    // The fixture holds a queue operation, a user turn and a tool_result turn (none carrying
    // counters), a `<synthetic>` notice, and three real calls — one logged as two lines.
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      kind: "request",
      vendor_id: SID,
      vendor_field: "sessionId",
      turn_id: "req_011Cdk8FcLJwNkFzLNRR8BpN",
      turn_field: "requestId",
      billed_request_id: "req_011Cdk8FcLJwNkFzLNRR8BpN",
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
        billed_request_id: "req_011Ce2HDaNo7CVCZKrT8yryX",
        model: "claude-opus-5",
        effort: "high",
        event_timestamp: "2026-08-14T07:54:15.988Z",
        agent_name: "Explore",
        // Read straight off the transcript with no journal beside it. No `step_plugin`: this
        // line carries no `attributionPlugin`, and one is never invented beside a real skill.
        step: "probe-echo",
        input_tokens: 2,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_creation_tokens: 20212,
      },
    ]);
  });

  // Built by removing the real fixture's own attributionSkill key rather than hand-writing a
  // payload, so this differs from the presence test above in that one field alone.
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

  // The fixture's synthetic line is a captured one: a session-limit notice Claude Code composed
  // itself, `model: "<synthetic>"`, four zero counters, its own `requestId`.
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

  // The filter is the marker, not the symptom: all-counters-zero on a real model is improbable
  // rather than impossible, and dropping it would lose a real call with nothing able to tell.
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
  // Claude Code writes a line when a message starts and again when it completes, sharing one
  // `message.id`; keeping the first kept a placeholder and discarded 37.4% of output tokens.
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
