import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Side-effect imports: both use-cases resolve each tool's declaration from the registry,
// so every AI tool must be registered for these tests to see Claude Code's and Codex's.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReadLocalCostUseCase } from "../../../../src/application/use-cases/telemetry/read-local-cost-use-case.js";
import { ReceiveTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/receive-telemetry-use-case.js";
import { mapClaudeCodeTranscriptToSinkRecords } from "../../../../src/domain/formats/claude-code-transcript.js";
import type { TelemetrySinkRecord } from "../../../../src/domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../../src/domain/models/tool-ids.js";
import type { SessionCostReader } from "../../../../src/domain/ports/session-cost-reader.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { NULL_PERSON_IDENTITY_READER } from "../../../helpers/ports/in-memory-person-identity-reader.js";
import { NULL_RUN_JOURNAL_READER } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const TRANSCRIPT_SESSION_ID = "22222222-2222-4222-8222-222222222222";

function loadFixtureJson(name: string): unknown {
  const url = new URL(`../../../fixtures/telemetry-sink/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

function loadCapturedTranscript(): string {
  const url = new URL(
    `../../../fixtures/local-cost/.claude/projects/fake-project/${TRANSCRIPT_SESSION_ID}.jsonl`,
    import.meta.url
  );
  return readFileSync(fileURLToPath(url), "utf8");
}

function readSourceFile(relativePathFromSrc: string): string {
  const url = new URL(`../../../../src/${relativePathFromSrc}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

/** Exercises the real export path (`ReceiveTelemetryUseCase`) against the captured Claude
 * Code OTLP fixture already used by `telemetry-sink-record.unit.test.ts` — no hand-written
 * payload, so the mapper is proven against a shape it was actually measured on. */
async function receiveCapturedExport(): Promise<{
  readonly sink: InMemoryTelemetrySink;
  readonly records: readonly TelemetrySinkRecord[];
}> {
  const sink = new InMemoryTelemetrySink();
  const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
  await useCase.receive(
    "/v1/logs",
    loadFixtureJson("otlp-logs-claude-code.json"),
    new Date("2026-08-19T10:00:00Z")
  );
  return { sink, records: [...sink.files.values()].flat() };
}

/** Exercises the real local-read path (`ReadLocalCostUseCase`) against the captured Claude
 * Code transcript fixture already used by `claude-code-transcript.unit.test.ts`. The
 * transcript is parsed by the real pure mapper; only the file-walking adapter is stubbed
 * out, keeping this a unit test while still proving the use-case's own stamping. */
async function readCapturedTranscript(): Promise<{
  readonly sink: InMemoryTelemetrySink;
  readonly records: readonly TelemetrySinkRecord[];
}> {
  const candidates = mapClaudeCodeTranscriptToSinkRecords(loadCapturedTranscript());
  const stubReader: SessionCostReader = {
    read: async () => ({ records: candidates, sessionFound: true }),
  };
  const sink = new InMemoryTelemetrySink();
  const useCase = new ReadLocalCostUseCase(
    sink,
    new Map([["claude", stubReader]]),
    NULL_RUN_JOURNAL_READER,
    NULL_PERSON_IDENTITY_READER
  );
  await useCase.execute({ sessionId: TRANSCRIPT_SESSION_ID });
  return { sink, records: [...sink.files.values()].flat() };
}

describe("every stored record names its tool", () => {
  it("names a tool on every record produced from a captured export", async () => {
    const { records } = await receiveCapturedExport();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.tool !== undefined)).toBe(true);
  });

  it("names a tool on every record produced from a captured transcript", async () => {
    const { records } = await readCapturedTranscript();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.tool !== undefined)).toBe(true);
  });

  it("names only a declared tool identifier, never a free string, on either route", async () => {
    const { records: exported } = await receiveCapturedExport();
    const { records: readLocally } = await readCapturedTranscript();
    for (const record of [...exported, ...readLocally]) {
      expect(AI_TOOL_IDS).toContain(record.tool);
    }
  });

  // Task 2's own criterion, proven end to end: the same tool, read by both routes, names
  // itself identically while `vendor_field` — the attribute that carried the identity —
  // differs, because that attribute genuinely differs per route. This is the reason the
  // field exists: a consumer reversing `vendor_field` alone could not tell these are the
  // same tool without also knowing the route.
  it("names the same tool by both routes, though vendor_field differs between them", async () => {
    const { records: exported } = await receiveCapturedExport();
    const { records: readLocally } = await readCapturedTranscript();

    expect(exported.every((record) => record.tool === "claude")).toBe(true);
    expect(readLocally.every((record) => record.tool === "claude")).toBe(true);
    expect(exported[0]?.vendor_field).toBe("session.id");
    expect(readLocally[0]?.vendor_field).toBe("sessionId");
    expect(exported[0]?.vendor_field).not.toBe(readLocally[0]?.vendor_field);
  });

  // Derived from AI_TOOL_IDS, never hand-listed: hardcoding the tool names here would
  // defeat the very criterion it proves — that adding a tool is a declaration the mapper
  // and the use-cases never have to be told about by name.
  it("contains no tool name, by string literal, in the mapper or either use-case", () => {
    const sources = [
      readSourceFile("domain/models/telemetry-sink-record.ts"),
      readSourceFile("application/use-cases/telemetry/receive-telemetry-use-case.ts"),
      readSourceFile("application/use-cases/telemetry/read-local-cost-use-case.ts"),
    ];
    for (const source of sources) {
      for (const toolId of AI_TOOL_IDS) {
        expect(source).not.toContain(`"${toolId}"`);
        expect(source).not.toContain(`'${toolId}'`);
      }
    }
  });
});
