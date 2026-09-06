import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { mapClaudeCodeTranscriptToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/claude-code-transcript.js";
import { mapCodexRolloutToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/codex-rollout.js";
import { mapCopilotEventsToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/copilot-events.js";
import { mapOpencodeExportToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/opencode-export.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { getAiToolConfig } from "../../../../src/contexts/tools/domain/registry.js";
import type { TelemetryRouteSupply } from "../../../../src/kernel/measurement.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../../src/kernel/tool.js";

/** Everything the local-read route was measured to produce, from the captures this
 * repository holds. A declaration is checked against these rather than against the
 * documentation, so a route claiming an amount its reader never sets fails here rather
 * than downstream. Local read is the only route this system still reads — the export
 * route (and its own declaration) was deleted in "one route, and every sentence about it
 * true" (aidd_docs/tasks/2026_08/2026_08_28_one-route-that-is-true/). */
type Route = "local";

function fixture(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/${relativePath}`, import.meta.url)),
    {
      encoding: "utf8",
    }
  );
}

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const COPILOT_SESSION = "33333333-3333-4333-8333-333333333333";

/** Whatever a capture yields, reduced to the four facts a route declares. */
function observe(records: readonly Partial<TelemetrySinkRecord>[]): TelemetryRouteSupply {
  const some = (has: (record: Partial<TelemetrySinkRecord>) => boolean) => records.some(has);
  return {
    tokenCounters: some(
      (record) =>
        record.input_tokens !== undefined ||
        record.output_tokens !== undefined ||
        record.cache_read_tokens !== undefined ||
        record.cache_creation_tokens !== undefined
    ),
    amount: some((record) => record.cost_usd !== undefined),
    toolStatedStep: some((record) => record.step !== undefined),
    agentName: some((record) => record.agent_name !== undefined),
  };
}

const CAPTURES: ReadonlyMap<string, () => TelemetryRouteSupply> = new Map([
  [
    // Both files, because both are this session's local read: the adapter walks the main
    // transcript and the subagent's own file, and only the second carries the field the
    // tool uses to name the running skill.
    "claude:local",
    () =>
      observe([
        ...mapClaudeCodeTranscriptToSinkRecords(
          fixture(`local-cost/.claude/projects/fake-project/${CLAUDE_SESSION}.jsonl`)
        ),
        ...mapClaudeCodeTranscriptToSinkRecords(
          fixture(
            `local-cost/.claude/projects/fake-project/${CLAUDE_SESSION}/subagents/agent-aa81cdef3bb58820c.jsonl`
          )
        ),
      ]),
  ],
  [
    "codex:local",
    () =>
      observe(
        mapCodexRolloutToSinkRecords(
          fixture(
            `local-cost/.codex/sessions/2026/07/29/rollout-2026-07-29T17-12-26-${CODEX_SESSION}.jsonl`
          )
        )
      ),
  ],
  [
    "copilot:local",
    () =>
      observe(
        mapCopilotEventsToSinkRecords(
          fixture(`local-cost/.copilot/session-state/${COPILOT_SESSION}/events.jsonl`),
          COPILOT_SESSION
        )
      ),
  ],
  [
    "opencode:local",
    () =>
      observe(
        mapOpencodeExportToSinkRecords(
          JSON.parse(fixture("telemetry-sink/opencode-export.json")),
          "ses_probe"
        )
      ),
  ],
]);

function declarationOf(tool: AiToolId) {
  return getAiToolConfig(tool).telemetryLocalRead;
}

const route: Route = "local";

describe("what a route declares it supplies, against what its reader actually produces", () => {
  for (const tool of AI_TOOL_IDS) {
    const declaration = declarationOf(tool);
    if (declaration.kind !== "declared") continue;
    const capture = CAPTURES.get(`${tool}:${route}`);

    if (!capture) {
      it(`${tool} declares a ${route} route with no capture, so it may claim nothing`, () => {
        // A declared route nobody ever captured has been measured to carry an identifier
        // and nothing else. Letting it claim a capability would be documenting a guess as
        // a fact, which is the one thing this layer exists to prevent.
        expect(declaration.supplies).toEqual({
          tokenCounters: false,
          amount: false,
          toolStatedStep: false,
          agentName: false,
        });
      });
      continue;
    }

    it(`${tool}'s ${route} route supplies exactly what it declares`, () => {
      expect(capture()).toEqual(declaration.supplies);
    });
  }

  // `TelemetryLocalRead` used to carry a third variant, "unmeasured" — no reader wired yet
  // — that no profile ever produced (`AI_TOOL_IDS.every` below is exhaustive: five tools,
  // each declaring one of the two kinds that remain). Removed rather than left as a branch
  // nothing could reach; this pins the union at exactly the two kinds a profile can state.
  it("declares only 'declared' or 'unsupported' — a route never left unmeasured", () => {
    for (const tool of AI_TOOL_IDS) {
      expect(declarationOf(tool).kind).toMatch(/^(declared|unsupported)$/u);
    }
  });

  it("has a capture for every route that claims to supply anything", () => {
    for (const tool of AI_TOOL_IDS) {
      const declaration = declarationOf(tool);
      if (declaration.kind !== "declared") continue;
      const claimsSomething = Object.values(declaration.supplies).some(Boolean);

      expect(
        !claimsSomething || CAPTURES.has(`${tool}:${route}`),
        `"${tool}" claims its ${route} route supplies something, with no capture to check it against`
      ).toBe(true);
    }
  });
});
