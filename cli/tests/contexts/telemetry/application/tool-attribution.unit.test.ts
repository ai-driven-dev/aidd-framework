import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves each tool's declaration from the registry,
// so every AI tool must be registered for these tests to see Claude Code's and Codex's.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { ReadLocalCostUseCase } from "../../../../src/contexts/telemetry/application/read-local-cost-use-case.js";
import { mapClaudeCodeTranscriptToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/claude-code-transcript.js";
import type { SessionCostReader } from "../../../../src/contexts/telemetry/domain/ports/session-cost-reader.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../../src/kernel/tool.js";
import { NULL_PERSON_IDENTITY_READER } from "../../../helpers/ports/in-memory-person-identity-reader.js";
import { NULL_RUN_JOURNAL_READER } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { StubTelemetryEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

const TRANSCRIPT_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ROOT = "/repo";

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
    NULL_PERSON_IDENTITY_READER,
    new StubTelemetryEvidenceReader()
  );
  await useCase.execute({
    projectRoot: PROJECT_ROOT,
    env: {},
    sessionId: TRANSCRIPT_SESSION_ID,
  });
  return { sink, records: [...sink.files.values()].flat() };
}

describe("every stored record names its tool", () => {
  it("names a tool on every record produced from a captured transcript", async () => {
    const { records } = await readCapturedTranscript();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.tool !== undefined)).toBe(true);
  });

  it("names only a declared tool identifier, never a free string", async () => {
    const { records } = await readCapturedTranscript();
    for (const record of records) {
      expect(AI_TOOL_IDS).toContain(record.tool);
    }
  });

  it("names the tool consistently, and the vendor field it read the identity from", async () => {
    const { records } = await readCapturedTranscript();
    expect(records.every((record) => record.tool === "claude")).toBe(true);
    expect(records[0]?.vendor_field).toBe("sessionId");
  });

  // Derived from AI_TOOL_IDS, never hand-listed: hardcoding the tool names here would
  // defeat the very criterion it proves — that adding a tool is a declaration the use-case
  // never has to be told about by name.
  it("contains no tool name, by string literal, in the local-read use-case", () => {
    const source = readSourceFile("contexts/telemetry/application/read-local-cost-use-case.ts");
    for (const toolId of AI_TOOL_IDS) {
      expect(source).not.toContain(`"${toolId}"`);
      expect(source).not.toContain(`'${toolId}'`);
    }
  });
});
