import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import type { TelemetryRouteSupply } from "../../../src/domain/capabilities/telemetry-capability.js";
import { mapClaudeCodeTranscriptToSinkRecords } from "../../../src/domain/formats/claude-code-transcript.js";
import { mapCodexRolloutToSinkRecords } from "../../../src/domain/formats/codex-rollout.js";
import { mapOpencodeExportToSinkRecords } from "../../../src/domain/formats/opencode-export.js";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import { mapOtlpLogsToSinkRecords } from "../../../src/domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../src/domain/models/tool-ids.js";
import { getAiToolConfig } from "../../../src/domain/tools/registry.js";

/** Everything a declared route was measured to produce, from the captures this repository
 * holds. A declaration is checked against these rather than against the documentation, so
 * a route claiming an amount its reader never sets fails here rather than downstream. */
type Route = "export" | "local";

function fixture(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${relativePath}`, import.meta.url)), {
    encoding: "utf8",
  });
}

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";

/** Whatever a capture yields, reduced to the three facts a route declares. */
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
    "claude:export",
    () =>
      observe(
        mapOtlpLogsToSinkRecords(JSON.parse(fixture("telemetry-sink/otlp-logs-claude-code.json")), [
          { tool: "claude", identityAttribute: "session.id" },
        ])
      ),
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

function declarationOf(tool: AiToolId, route: Route) {
  const config = getAiToolConfig(tool);
  return route === "export" ? config.telemetryExport : config.telemetryLocalRead;
}

describe("what a route declares it supplies, against what its reader actually produces", () => {
  for (const tool of AI_TOOL_IDS) {
    for (const route of ["export", "local"] as const) {
      const declaration = declarationOf(tool, route);
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
          });
        });
        continue;
      }

      it(`${tool}'s ${route} route supplies exactly what it declares`, () => {
        expect(capture()).toEqual(declaration.supplies);
      });
    }
  }

  it("has a capture for every route that claims to supply anything", () => {
    for (const tool of AI_TOOL_IDS) {
      for (const route of ["export", "local"] as const) {
        const declaration = declarationOf(tool, route);
        if (declaration.kind !== "declared") continue;
        const claimsSomething = Object.values(declaration.supplies).some(Boolean);

        expect(
          !claimsSomething || CAPTURES.has(`${tool}:${route}`),
          `"${tool}" claims its ${route} route supplies something, with no capture to check it against`
        ).toBe(true);
      }
    }
  });
});
