import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves each tool's local-read declaration from the
// registry, so every AI tool must be registered for these tests to see it.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReadLocalCostUseCase } from "../../../../src/application/use-cases/telemetry/read-local-cost-use-case.js";
import type {
  LocalCostCandidateRecord,
  SessionCostReader,
} from "../../../../src/domain/ports/session-cost-reader.js";
import type { AiTool } from "../../../../src/domain/tools/contracts.js";
import { getAiToolConfig, registerTool } from "../../../../src/domain/tools/registry.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const SESSION_ID = "s-1";

function stubReader(records: readonly LocalCostCandidateRecord[]): SessionCostReader {
  return { read: async (sessionId: string) => (sessionId === SESSION_ID ? records : []) };
}

// Shaped like a real Claude Code transcript reader's output (see
// domain/formats/claude-code-transcript.ts), but this file stubs `SessionCostReader`
// throughout — it tests the use-case's own orchestration (dedup, status, provenance
// stamping), independent of any tool's real reader.
const CANDIDATE: LocalCostCandidateRecord = {
  kind: "request",
  vendor_id: SESSION_ID,
  vendor_field: "sessionId",
  turn_id: "req_1",
  turn_field: "requestId",
  model: "claude-sonnet-5",
  input_tokens: 10,
  output_tokens: 20,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
};

describe("ReadLocalCostUseCase", () => {
  let claudeConfig: AiTool<unknown>;

  beforeEach(() => {
    claudeConfig = getAiToolConfig("claude");
  });

  afterEach(() => {
    // registerTool mutates a module-level registry — restore it so no other test sees a
    // "claude declares a local read" world that does not actually ship yet.
    registerTool(claudeConfig);
  });

  function declareClaudeReadable(): void {
    registerTool({ ...claudeConfig, telemetryLocalRead: { kind: "declared" } });
  }

  it("carries a covered tool's stated limitation through to the report, since a source comment reaches nobody", async () => {
    registerTool({
      ...claudeConfig,
      telemetryLocalRead: { kind: "declared", limitation: "read alone: nothing to join on yet." },
    });
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([CANDIDATE])]]));

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({
      status: "found",
      reason: "read alone: nothing to join on yet.",
    });
  });

  it("invents no limitation for a covered tool that declares none", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([CANDIDATE])]]));

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport && "reason" in claudeReport).toBe(false);
  });

  it("stores a found session's counters in the stored shape, marked as read locally", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([CANDIDATE])]]));

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({ status: "found", recordsFound: 1, recordsStored: 1 });
    const [stored] = [...sink.files.values()].flat();
    expect(stored).toMatchObject({
      sink_schema_version: 2,
      provenance: "local-read",
      vendor_id: SESSION_ID,
      input_tokens: 10,
      output_tokens: 20,
    });
  });

  it("leaves the store byte-identical on a second read of the same session", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([CANDIDATE])]]));

    await useCase.execute({ sessionId: SESSION_ID });
    const afterFirst = JSON.stringify([...sink.files.values()]);

    const second = await useCase.execute({ sessionId: SESSION_ID });
    const afterSecond = JSON.stringify([...sink.files.values()]);

    expect(afterSecond).toBe(afterFirst);
    // Still "found", not "empty": the reader returned a record, dedup just skipped it —
    // collapsing this into "empty" would erase the distinction task 5 exists to keep.
    const claudeReport = second.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({ status: "found", recordsFound: 1, recordsStored: 0 });
  });

  it("reports a tool with no declared local read as not-covered, with its declared reason", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map());

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const copilot = result.toolReports.find((r) => r.tool === "copilot");
    expect(copilot?.status).toBe("not-covered");
    expect(copilot?.reason).toContain("outputTokens");
    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.reason).toContain("token count");
  });

  it("reports an unmeasured tool as not-covered with no reason invented for it", async () => {
    // Every AI tool is either declared or explicitly unsupported as of phase 3, so
    // "unmeasured" is exercised here via an override rather than a real tool — the
    // use-case must still report it as not-covered, with no reason fabricated for a
    // fact that has not been established either way.
    registerTool({ ...claudeConfig, telemetryLocalRead: { kind: "unmeasured" } });
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map());

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude).toMatchObject({ status: "not-covered", reason: undefined });
  });

  it("distinguishes not-covered from covered-and-empty", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([])]]));

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude).toMatchObject({ status: "empty", recordsFound: 0, recordsStored: 0 });
    const copilot = result.toolReports.find((r) => r.tool === "copilot");
    expect(copilot?.status).toBe("not-covered");
  });

  it("stores what a partial read returns without erroring, when a session is still in progress", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    // A reader mid-transcript returns only the complete records it already parsed — the
    // use-case has no way to know, or need to know, that more will exist on a later read.
    const useCase = new ReadLocalCostUseCase(sink, new Map([["claude", stubReader([CANDIDATE])]]));

    await expect(useCase.execute({ sessionId: SESSION_ID })).resolves.toBeDefined();
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  it("never synthesises a key for a candidate with no request identifier, and cannot dedup it", async () => {
    declareClaudeReadable();
    const noIdCandidate: LocalCostCandidateRecord = { ...CANDIDATE, turn_id: undefined };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([noIdCandidate])]])
    );

    await useCase.execute({ sessionId: SESSION_ID });
    const second = await useCase.execute({ sessionId: SESSION_ID });

    // Both reads store it — undeduplicated, as the port's contract accepts for a tool
    // with no stable per-record identifier, rather than inventing an unstable one.
    expect([...sink.files.values()].flat()).toHaveLength(2);
    expect(second.toolReports.find((r) => r.tool === "claude")?.recordsStored).toBe(1);
    for (const stored of [...sink.files.values()].flat()) {
      expect(stored.turn_id).toBeUndefined();
    }
  });
});
