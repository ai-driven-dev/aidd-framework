import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves each tool's local-read declaration from the
// registry, so every AI tool must be registered for these tests to see it.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { ReadLocalCostUseCase } from "../../../../src/contexts/telemetry/application/read-local-cost-use-case.js";
import { mapCodexRolloutToSinkRecords } from "../../../../src/contexts/telemetry/domain/formats/codex-rollout.js";
import type { RunJournal } from "../../../../src/contexts/telemetry/domain/ports/run-journal-reader.js";
import type {
  LocalCostCandidateRecord,
  SessionCostReader,
} from "../../../../src/contexts/telemetry/domain/ports/session-cost-reader.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import type { AiTool } from "../../../../src/contexts/tools/domain/contracts.js";
import { getAiToolConfig, registerTool } from "../../../../src/contexts/tools/domain/registry.js";
import type { AiToolId } from "../../../../src/kernel/tool.js";
import { FakeCurrentVersion } from "../../../helpers/ports/fake-current-version.js";
import {
  InMemoryPersonIdentityReader,
  NULL_PERSON_IDENTITY_READER,
} from "../../../helpers/ports/in-memory-person-identity-reader.js";
import {
  InMemoryRunJournalReader,
  NULL_RUN_JOURNAL_READER,
} from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { StubTelemetryEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

const SESSION_ID = "s-1";
const PROJECT_ROOT = "/repo";
// The project switch always answers "on" here: every test in this file is about what the
// sink, the journal or a reader hold. Its refusal is covered on its own, below.
const TELEMETRY_EVIDENCE_READER = new StubTelemetryEvidenceReader();

function stubReader(records: readonly LocalCostCandidateRecord[]): SessionCostReader {
  return {
    read: async (sessionId: string) =>
      sessionId === SESSION_ID
        ? { records, sessionFound: true }
        : { records: [], sessionFound: false },
  };
}

function journalWithTurnEnd(at: string): RunJournal {
  return {
    boundaries: [{ type: "turn_end", at }],
    filesWritten: [],
    taskDeclarations: [],
  };
}

// The same real, redacted rollout excerpt `codex-rollout.unit.test.ts` asserts against, its
// last turn's two `token_count` lines cut to one: a session read while it was still running.
const CODEX_TARGET_ID = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const CODEX_FIXTURE_PATH =
  ".codex/sessions/2026/07/29/rollout-2026-07-29T17-12-26-019fae6f-2009-7cd3-86b2-b8f83481b160.jsonl";
const CODEX_LAST_TURN_ID = "019fae71-ae8b-7850-a982-78d7cd9dba52";

function loadCodexFixture(): string {
  const url = new URL(`../../../fixtures/local-cost/${CODEX_FIXTURE_PATH}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

/** The real Codex reader, fed a different snapshot of the rollout's bytes on each call, as
 * `CodexCostReaderAdapter` sees a growing file. The last snapshot repeats once exhausted. */
function growingCodexReader(...snapshots: readonly string[]): SessionCostReader {
  let call = 0;
  return {
    read: async (sessionId: string) => {
      if (sessionId !== CODEX_TARGET_ID) return { records: [], sessionFound: false };
      const content = snapshots[Math.min(call, snapshots.length - 1)];
      call++;
      return { records: mapCodexRolloutToSinkRecords(content), sessionFound: true };
    },
  };
}

// The full fixture's last turn sums to input 5032 / output 3550 / cache-read 99840; dropping
// its final line leaves only its first increment, input 2816 / output 1401 / cache-read 48896.
function truncatedCodexFixture(): string {
  return loadCodexFixture().split("\n").slice(0, 7).join("\n");
}

// Shaped like a real Claude Code transcript record, but this file stubs `SessionCostReader`
// throughout: it tests the use-case's orchestration, not any tool's real reader.
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

  // The minimum the type requires: what a route supplies is not what this file tests.
  const SUPPLIES_NOTHING = {
    tokenCounters: false,
    amount: false,
    toolStatedStep: false,
    agentName: false,
  } as const;

  function declareClaudeReadable(): void {
    registerTool({
      ...claudeConfig,
      telemetryLocalRead: { kind: "declared", supplies: SUPPLIES_NOTHING },
    });
  }

  it("carries a covered tool's stated limitation through to the report, since a source comment reaches nobody", async () => {
    registerTool({
      ...claudeConfig,
      telemetryLocalRead: {
        kind: "declared",
        limitation: "read alone: nothing to join on yet.",
        supplies: SUPPLIES_NOTHING,
      },
    });
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({
      status: "found",
      reason: "read alone: nothing to join on yet.",
    });
  });

  it("invents no limitation for a covered tool that declares none", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport && "reason" in claudeReport).toBe(false);
  });

  it("stores a found session's counters in the stored shape, marked as read locally", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const claudeReport = result.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({ status: "found", recordsFound: 1, recordsStored: 1 });
    const [stored] = [...sink.files.values()].flat();
    expect(stored).toMatchObject({
      sink_schema_version: 2,
      provenance: "local-read",
      tool: "claude",
      vendor_id: SESSION_ID,
      input_tokens: 10,
      output_tokens: 20,
    });
  });

  it("stamps no person field when nobody opted in - the default", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect("person_id" in stored).toBe(false);
    expect("person_display_name" in stored).toBe(false);
  });

  it("stamps the CLI's own version on the record it stores, read through the version port", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER,
      new FakeCurrentVersion("9.9.9-test")
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.cli_version).toBe("9.9.9-test");
  });

  it("stamps no cli_version at all when no version reader was given - never a guessed default", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect("cli_version" in stored).toBe(false);
  });

  it("stamps the identifier a person chose, and a display name only once they set one", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      new InMemoryPersonIdentityReader({ personId: "person-1", origin: "minted", alsoMe: [] }),
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.person_id).toBe("person-1");
    expect("person_display_name" in stored).toBe(false);
  });

  it("carries a display name alongside the identifier, never in its place", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      new InMemoryPersonIdentityReader({
        personId: "person-1",
        origin: "minted",
        alsoMe: [],
        displayName: "Baptiste",
      }),
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.person_id).toBe("person-1");
    expect(stored.person_display_name).toBe("Baptiste");
  });

  it("leaves a session stored before opting in unnamed, even on a later read", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const identity = new InMemoryPersonIdentityReader(null);
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      identity,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });
    identity.set({ personId: "person-1", origin: "minted", alsoMe: [] });
    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect("person_id" in stored).toBe(false);
  });

  // `CANDIDATE` carries no `tool` field — the type omits it — so the stamp cannot have come
  // from the reader.
  it("stamps the tool it asked", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.tool).toBe("claude");
  });

  // `LocalCostCandidateRecord` omits `tool`, so the assignment below does not compile;
  // `@ts-expect-error` inverts that into the assertion — make it settable and `tsc` fails.
  it("forbids a reader from naming its own tool, at compile time", () => {
    const candidate: LocalCostCandidateRecord = {
      ...CANDIDATE,
      // @ts-expect-error `tool` is omitted from what a reader may return
      tool: "codex",
    };
    expect(candidate).toBeDefined();
  });

  it("leaves the store byte-identical on a second read of the same session", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });
    const afterFirst = JSON.stringify([...sink.files.values()]);

    const second = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });
    const afterSecond = JSON.stringify([...sink.files.values()]);

    expect(afterSecond).toBe(afterFirst);
    // Still "found", not "empty": the reader returned a record, dedup just skipped it.
    const claudeReport = second.toolReports.find((r) => r.tool === "claude");
    expect(claudeReport).toMatchObject({ status: "found", recordsFound: 1, recordsStored: 0 });
  });

  it("reports a tool with no declared local read as not-covered, with its declared reason", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map(),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.status).toBe("not-covered");
    expect(cursor?.reason).toContain("token count");
  });

  it("reports an unsupported tool's not-covered reason as exactly what it declared, nothing invented", async () => {
    const cursorLocalRead = getAiToolConfig("cursor").telemetryLocalRead;
    if (cursorLocalRead.kind !== "unsupported") {
      throw new Error("cursor is expected to declare an unsupported local read for this test");
    }
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map(),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.reason).toBe(cursorLocalRead.reason);
  });

  it("distinguishes not-covered from covered-and-empty", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude).toMatchObject({ status: "empty", recordsFound: 0, recordsStored: 0 });
    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.status).toBe("not-covered");
  });

  it("stores what a partial read returns without erroring, when a session is still in progress", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    // A reader mid-transcript returns only the complete records it already parsed — the
    // use-case has no way to know, or need to know, that more will exist on a later read.
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await expect(
      useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID })
    ).resolves.toBeDefined();
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  // A requestId appearing in more than one transcript file hands one read both copies as two
  // candidates of the same batch, so the index of what is stored has to stay live inside it.
  it("stores one line when a single read hands it the same turn twice", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE, { ...CANDIDATE }])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    expect([...sink.files.values()].flat()).toHaveLength(1);
    expect(result.toolReports.find((r) => r.tool === "claude")?.recordsStored).toBe(1);
  });

  // `isLocalReadTurnCorrection` still has to fire inside one batch: a live index must not
  // turn a strictly improving second candidate into a drop.
  it("still lands a correction when the larger reading arrives in the same read", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const larger: LocalCostCandidateRecord = { ...CANDIDATE, output_tokens: 900 };
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE, larger])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    expect([...sink.files.values()].flat().map((r) => r.output_tokens)).toEqual([20, 900]);
  });

  // The live index keys on a real identifier and nothing else: one shared key for the keyless
  // records would match the second against the first and drop it.
  it("appends every keyless candidate of one batch, never matching two of them to each other", async () => {
    declareClaudeReadable();
    const keyless: LocalCostCandidateRecord = { ...CANDIDATE, turn_id: undefined };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([keyless, { ...keyless }])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    expect([...sink.files.values()].flat()).toHaveLength(2);
  });

  it("never synthesises a key for a candidate with no request identifier, and cannot dedup it", async () => {
    declareClaudeReadable();
    const noIdCandidate: LocalCostCandidateRecord = { ...CANDIDATE, turn_id: undefined };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([noIdCandidate])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });
    const second = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    // Both reads store it — undeduplicated, as the port's contract accepts for a tool
    // with no stable per-record identifier, rather than inventing an unstable one.
    expect([...sink.files.values()].flat()).toHaveLength(2);
    expect(second.toolReports.find((r) => r.tool === "claude")?.recordsStored).toBe(1);
    for (const stored of [...sink.files.values()].flat()) {
      expect(stored.turn_id).toBeUndefined();
    }
  });

  // `codex-rollout.ts` flushes the pending turn unconditionally, so a Codex turn read while
  // its session runs is stored partial, and its completed reading shares that `turn_id`.
  describe("a Codex turn read while it runs is not the last word", () => {
    it("lands the completed figures once the rest of the turn arrives", async () => {
      const sink = new InMemoryTelemetrySink();
      const reader = growingCodexReader(truncatedCodexFixture(), loadCodexFixture());
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["codex", reader]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      const first = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });
      const beforeTurn = [...sink.files.values()]
        .flat()
        .find((r) => r.turn_id === CODEX_LAST_TURN_ID);
      // The partial reading: only the turn's first token_count increment had landed.
      expect(beforeTurn).toMatchObject({ cache_read_tokens: 48896, output_tokens: 1401 });
      expect(first.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(2);

      const second = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });
      const turnRecords = [...sink.files.values()]
        .flat()
        .filter((r) => r.turn_id === CODEX_LAST_TURN_ID);

      // The correction landed as a second line — the sink is append-only — carrying the
      // complete figures the fixture's own unit test asserts for this turn.
      expect(second.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(1);
      expect(turnRecords).toHaveLength(2);
      expect(turnRecords[1]).toMatchObject({
        cache_read_tokens: 99840,
        output_tokens: 3550,
        input_tokens: 5032,
      });
      // The partial reading stays: the sink never edits a stored line, and it is
      // `collapseSupersededTurns` in the built report that keeps only the larger of the two.
    });

    it("stops re-appending once a re-read brings nothing new", async () => {
      const sink = new InMemoryTelemetrySink();
      const full = loadCodexFixture();
      const reader = growingCodexReader(full, full, full);
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["codex", reader]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: CODEX_TARGET_ID });
      const second = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });
      const third = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });

      // A finished turn read twice (or three times) is counted once, and its figures do
      // not change — the same reading offers no improvement over what is already stored.
      expect(second.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(0);
      expect(third.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(0);
      expect(
        [...sink.files.values()].flat().filter((r) => r.turn_id === CODEX_LAST_TURN_ID)
      ).toHaveLength(1);
    });

    it("never lets a later, smaller reading of the same turn replace the larger one", async () => {
      const sink = new InMemoryTelemetrySink();
      const reader = growingCodexReader(loadCodexFixture(), truncatedCodexFixture());
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["codex", reader]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: CODEX_TARGET_ID });
      const second = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });

      expect(second.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(0);
      const turnRecords = [...sink.files.values()]
        .flat()
        .filter((r) => r.turn_id === CODEX_LAST_TURN_ID);
      expect(turnRecords).toHaveLength(1);
      expect(turnRecords[0]).toMatchObject({ cache_read_tokens: 99840, output_tokens: 3550 });
    });

    it("lands the completed figures even once the run journal's own turn_end has been seen", async () => {
      // A `turn_end` says only that no *more* growth is coming; a strictly larger candidate is
      // itself proof the stored reading was not final, whatever the journal's clock says.
      const sink = new InMemoryTelemetrySink();
      const journalReader = new InMemoryRunJournalReader();
      // This turn_end lands after the fixture's last turn opens.
      journalReader.set(CODEX_TARGET_ID, journalWithTurnEnd("2026-07-29T15:20:00Z"));
      const reader = growingCodexReader(truncatedCodexFixture(), loadCodexFixture());
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["codex", reader]]),
        journalReader,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: CODEX_TARGET_ID });
      const second = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        env: {},
        sessionId: CODEX_TARGET_ID,
      });

      expect(second.toolReports.find((r) => r.tool === "codex")?.recordsStored).toBe(1);
      const turnRecords = [...sink.files.values()]
        .flat()
        .filter((r) => r.turn_id === CODEX_LAST_TURN_ID);
      expect(turnRecords).toHaveLength(2);
      expect(turnRecords[1]).toMatchObject({ cache_read_tokens: 99840, output_tokens: 3550 });
    });
  });

  it("never re-appends a kind: 'session' record sharing a turn_id, even once corrections exist for kind: 'request'", async () => {
    declareClaudeReadable();
    const sessionCandidate: LocalCostCandidateRecord = {
      kind: "session",
      vendor_id: SESSION_ID,
      vendor_field: "sessionId",
      turn_id: "shutdown-1",
      turn_field: "id",
      cache_read_tokens: 5,
    };
    const grownSessionCandidate: LocalCostCandidateRecord = {
      ...sessionCandidate,
      cache_read_tokens: 7,
    };
    const sink = new InMemoryTelemetrySink();
    const reader: SessionCostReader = {
      read: async (sessionId: string) => {
        if (sessionId !== SESSION_ID) return { records: [], sessionFound: false };
        return { records: [grownSessionCandidate], sessionFound: true };
      },
    };
    await new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([sessionCandidate])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    ).execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", reader]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );
    const second = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    // A `kind: "session"` record is a one-shot cumulative total, never a growing per-turn
    // snapshot, so a re-read matching its turn_id is a drop and never a correction.
    expect(second.toolReports.find((r) => r.tool === "claude")?.recordsStored).toBe(0);
    expect([...sink.files.values()].flat().filter((r) => r.turn_id === "shutdown-1")).toHaveLength(
      1
    );
  });

  describe("step attribution", () => {
    const MOMENT_CANDIDATE: LocalCostCandidateRecord = {
      ...CANDIDATE,
      event_timestamp: "2026-08-20T10:02:00Z",
    };

    function journalWithOneStep(skill: string): InMemoryRunJournalReader {
      const journal = new InMemoryRunJournalReader();
      journal.set(SESSION_ID, {
        boundaries: [
          { type: "step_start", at: "2026-08-20T10:00:00Z", skill },
          { type: "turn_end", at: "2026-08-20T10:05:00Z" },
        ],
        filesWritten: [],
        taskDeclarations: [],
      });
      return journal;
    }

    it("stores a tool-stated step, marked as stated by the tool", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const candidate: LocalCostCandidateRecord = { ...CANDIDATE, step: "aidd-dev:02-implement" };
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([candidate])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored).toMatchObject({
        step_attribution: "tool-stated",
        step: "aidd-dev:02-implement",
      });
    });

    it("carries a tool-stated plugin alongside its step", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const candidate: LocalCostCandidateRecord = {
        ...CANDIDATE,
        step: "aidd-dev:02-implement",
        step_plugin: "aidd-dev",
      };
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([candidate])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.step_plugin).toBe("aidd-dev");
    });

    it("derives a step from a journal interval when the tool states none", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([MOMENT_CANDIDATE])]]),
        journalWithOneStep("aidd-dev:06-test"),
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored).toMatchObject({
        step_attribution: "journal-interval",
        step: "aidd-dev:06-test",
      });
    });

    it("reads a record as unattributed when neither the tool nor a journal can say", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([CANDIDATE])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.step_attribution).toBe("unattributed");
      expect(stored.step).toBeUndefined();
    });

    // A journal interval covers the same moment too, and still loses: the tool's own answer is
    // exact, an interval is only ever an inference.
    it("prefers the tool's own stated step over a journal interval that also covers it", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const candidate: LocalCostCandidateRecord = {
        ...MOMENT_CANDIDATE,
        step: "aidd-dev:02-implement",
      };
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([candidate])]]),
        journalWithOneStep("some-other-skill"),
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored).toMatchObject({
        step_attribution: "tool-stated",
        step: "aidd-dev:02-implement",
      });
    });

    // Attribution is an addition, never a precondition: the same transcript, read with and
    // without a journal beside it, stores the same figures.
    it("yields identical counters whether a journal is present or not", async () => {
      declareClaudeReadable();
      const withJournalSink = new InMemoryTelemetrySink();
      const withJournal = new ReadLocalCostUseCase(
        withJournalSink,
        new Map([["claude", stubReader([MOMENT_CANDIDATE])]]),
        journalWithOneStep("aidd-dev:06-test"),
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );
      const withoutJournalSink = new InMemoryTelemetrySink();
      const withoutJournal = new ReadLocalCostUseCase(
        withoutJournalSink,
        new Map([["claude", stubReader([MOMENT_CANDIDATE])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await withJournal.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });
      await withoutJournal.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [withStored] = [...withJournalSink.files.values()].flat();
      const [withoutStored] = [...withoutJournalSink.files.values()].flat();
      const counters = (record: typeof withStored) => ({
        input_tokens: record.input_tokens,
        output_tokens: record.output_tokens,
        cache_read_tokens: record.cache_read_tokens,
        cache_creation_tokens: record.cache_creation_tokens,
      });
      expect(counters(withStored)).toEqual(counters(withoutStored));
      expect(withStored.step_attribution).toBe("journal-interval");
      expect(withoutStored.step_attribution).toBe("unattributed");
    });
  });

  describe("project attribution", () => {
    function journalWithProject(
      projectId: string | undefined,
      projectRemote: string | undefined
    ): InMemoryRunJournalReader {
      const journal = new InMemoryRunJournalReader();
      journal.set(SESSION_ID, {
        session: {
          type: "session_start",
          at: "2026-08-20T09:59:00Z",
          run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          tool: "claude-code",
          vendor_id: SESSION_ID,
          ...(projectId === undefined ? {} : { project_id: projectId }),
          ...(projectRemote === undefined ? {} : { project_remote: projectRemote }),
        },
        boundaries: [],
        filesWritten: [],
        taskDeclarations: [],
      });
      return journal;
    }

    it("prefers the remote, and says so", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([CANDIDATE])]]),
        journalWithProject("acme-widgets", "git@github.com:acme/widgets.git"),
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.project_id).toBe("git@github.com:acme/widgets.git");
      expect(stored.project_field).toBe("project_remote");
    });

    it("falls back to the directory-name field with no remote, and says so", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([CANDIDATE])]]),
        journalWithProject("acme-widgets", undefined),
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.project_id).toBe("acme-widgets");
      expect(stored.project_field).toBe("project_id");
    });

    it("stores no project for a session with no journal at all", async () => {
      declareClaudeReadable();
      const sink = new InMemoryTelemetrySink();
      const useCase = new ReadLocalCostUseCase(
        sink,
        new Map([["claude", stubReader([CANDIDATE])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER,
        TELEMETRY_EVIDENCE_READER
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.project_id).toBeUndefined();
      expect(stored.project_field).toBeUndefined();
    });
  });
});

describe("a reader that fails", () => {
  const BOOM = "opencode export s-1 failed: spawnSync opencode ETIMEDOUT";

  function throwingReader(): SessionCostReader {
    return {
      read: async () => {
        throw new Error(BOOM);
      },
    };
  }

  it("costs its own tool's figures and no other tool's", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([
        ["opencode", throwingReader()],
        ["claude", stubReader([CANDIDATE])],
      ]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    const claude = result.toolReports.find((report) => report.tool === "claude");
    expect(claude?.status).toBe("found");
    expect(claude?.recordsStored).toBe(1);
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  it("says the tool could not be read, and why, in the reader's own words", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["opencode", throwingReader()]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const opencode = (
      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID })
    ).toolReports.find((report) => report.tool === "opencode");

    expect(opencode?.status).toBe("unreadable");
    expect(opencode?.reason).toBe(BOOM);
  });

  it("is a fifth answer, never one of the four that already exist", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["opencode", throwingReader()]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const opencode = (
      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID })
    ).toolReports.find((report) => report.tool === "opencode");

    // The four it must not be mistaken for: it billed nothing, it has no trace of the
    // session, it cannot be read at all, or it read fine.
    expect(["empty", "not-found", "not-covered", "found"]).not.toContain(opencode?.status);
  });

  it("claims no zero when every reader fails", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([
        ["opencode", throwingReader()],
        ["claude", throwingReader()],
      ]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    expect([...sink.files.values()].flat()).toEqual([]);
    const failed = result.toolReports.filter((report) =>
      ["opencode", "claude"].includes(report.tool)
    );
    expect(failed.map((report) => report.status)).toEqual(["unreadable", "unreadable"]);
    expect(failed.every((report) => report.recordsFound === 0)).toBe(true);
    expect(result.toolReports.some((report) => report.status === "empty")).toBe(false);
  });

  it("stores what a failed read missed, once the reader recovers", async () => {
    const sink = new InMemoryTelemetrySink();
    const failing = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", throwingReader()]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );
    await failing.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID });

    const recovered = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );
    const result = await recovered.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    expect(result.toolReports.find((report) => report.tool === "claude")?.recordsStored).toBe(1);
  });
});

describe("reading every session the journal knows", () => {
  function journalNaming(...vendorIds: readonly string[]): InMemoryRunJournalReader {
    const reader = new InMemoryRunJournalReader();
    for (const vendorId of vendorIds) {
      reader.set(vendorId, {
        boundaries: [],
        filesWritten: [],
        taskDeclarations: [],
        session: {
          type: "session_start",
          at: "2026-08-20T09:00:00Z",
          run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          tool: "claude-code",
          vendor_id: vendorId,
        },
      });
    }
    return reader;
  }

  function readerFor(records: ReadonlyMap<string, readonly LocalCostCandidateRecord[]>) {
    return {
      read: async (sessionId: string) => ({
        records: records.get(sessionId) ?? [],
        sessionFound: records.has(sessionId),
      }),
    };
  }

  it("reads every journalled session when none is named", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          readerFor(
            new Map([
              ["s-a", [{ ...CANDIDATE, vendor_id: "s-a", turn_id: "a" }]],
              ["s-b", [{ ...CANDIDATE, vendor_id: "s-b", turn_id: "b" }]],
            ])
          ),
        ],
      ]),
      journalNaming("s-a", "s-b"),
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} });

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["s-a", "s-b"]);
    expect([...sink.files.values()].flat()).toHaveLength(2);
  });

  it("reads only the session named, when one is", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["claude", readerFor(new Map([["s-a", [CANDIDATE]]]))]]),
      journalNaming("s-a", "s-b"),
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: "s-a" });

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["s-a"]);
  });

  it("reads nothing, without failing, when the journal names no session", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    expect(await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} })).toEqual({
      sessions: [],
      toolReports: expect.anything(),
    });
  });

  it("stores nothing new on a second sweep", async () => {
    const sink = new InMemoryTelemetrySink();
    const readers = new Map<AiToolId, SessionCostReader>([
      ["claude", readerFor(new Map([["s-a", [{ ...CANDIDATE, vendor_id: "s-a" }]]]))],
    ]);
    const useCase = new ReadLocalCostUseCase(
      sink,
      readers,
      journalNaming("s-a"),
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} });

    const second = await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} });

    expect(second.toolReports.find((report) => report.tool === "claude")?.recordsStored).toBe(0);
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  it("keeps reading the other sessions when one session's reader throws", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map<AiToolId, SessionCostReader>([
        [
          "claude",
          {
            read: async (sessionId: string) => {
              if (sessionId === "s-bad") throw new Error("that one is broken");
              return { records: [{ ...CANDIDATE, vendor_id: sessionId }], sessionFound: true };
            },
          },
        ],
      ]),
      journalNaming("s-bad", "s-good"),
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} });

    const bad = result.sessions.find((session) => session.sessionId === "s-bad");
    const good = result.sessions.find((session) => session.sessionId === "s-good");
    expect(bad?.toolReports.find((report) => report.tool === "claude")?.status).toBe("unreadable");
    expect(good?.toolReports.find((report) => report.tool === "claude")?.status).toBe("found");
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  it("sums a tool's counts across the sweep and keeps its strongest answer", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([
        [
          "claude",
          readerFor(
            new Map([
              ["s-a", [{ ...CANDIDATE, vendor_id: "s-a", turn_id: "a" }]],
              ["s-b", []],
            ])
          ),
        ],
      ]),
      journalNaming("s-a", "s-b"),
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const claude = (await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} })).toolReports.find(
      (report) => report.tool === "claude"
    );

    // It read one session and found nothing in the other. Reporting it as empty would
    // discard a real figure; reporting it as found is what actually happened.
    expect(claude?.status).toBe("found");
    expect(claude?.recordsFound).toBe(1);
  });
});

describe("a failure in a sweep does not disappear behind a success", () => {
  it("reports the tool as read, and still says how many sessions it could not read", async () => {
    // Nineteen good sessions and one bad is the case that matters: the figures are real, so a
    // failure visible only in the status would vanish exactly where there is most to lose.
    const journal = new InMemoryRunJournalReader();
    for (const vendorId of ["s-good", "s-bad"]) {
      journal.set(vendorId, {
        boundaries: [],
        filesWritten: [],
        taskDeclarations: [],
        session: {
          type: "session_start",
          at: "2026-08-20T09:00:00Z",
          run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          tool: "claude-code",
          vendor_id: vendorId,
        },
      });
    }
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map<AiToolId, SessionCostReader>([
        [
          "claude",
          {
            read: async (sessionId: string) => {
              if (sessionId === "s-bad") throw new Error("that one is broken");
              return { records: [{ ...CANDIDATE, vendor_id: sessionId }], sessionFound: true };
            },
          },
        ],
      ]),
      journal,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const claude = (await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} })).toolReports.find(
      (report) => report.tool === "claude"
    );

    expect(claude?.status).toBe("found");
    expect(claude?.recordsFound).toBe(1);
    expect(claude?.sessionsFailed).toBe(1);
    expect(claude?.failureReason).toBe("that one is broken");
  });

  it("counts no failure when every session read cleanly", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );

    const claude = (
      await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SESSION_ID })
    ).toolReports.find((report) => report.tool === "claude");

    expect(claude?.sessionsFailed).toBe(0);
    expect(claude?.failureReason).toBeUndefined();
  });

  // `read` is the only thing that writes a day file, so it is the only thing that can bound
  // how many there are.
  it("prunes day files outside the retention window, once per sweep", async () => {
    const sink = new InMemoryTelemetrySink();
    for (const day of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
      await sink.appendRecord(
        {
          ...CANDIDATE,
          sink_schema_version: 2,
          provenance: "local-read",
          tool: "claude",
          step_attribution: "unattributed",
        } as TelemetrySinkRecord,
        new Date(`${day}T00:00:00Z`)
      );
    }

    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER,
      undefined,
      undefined,
      2
    );
    await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      at: new Date("2026-01-03T12:00:00Z"),
    });

    expect(sink.deletedFiles).toEqual(["2026-01-01.jsonl"]);
  });

  // Housekeeping must never cost the figures the sweep just stored.
  it("reports its figures even when a day file cannot be deleted", async () => {
    const sink = new InMemoryTelemetrySink();
    for (const day of ["2026-01-01", "2026-01-02"]) {
      await sink.appendRecord(
        {
          ...CANDIDATE,
          sink_schema_version: 2,
          provenance: "local-read",
          tool: "claude",
          step_attribution: "unattributed",
        } as TelemetrySinkRecord,
        new Date(`${day}T00:00:00Z`)
      );
    }
    sink.undeletable.add("2026-01-01.jsonl");

    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER,
      undefined,
      undefined,
      1
    );

    await expect(
      useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, at: new Date("2026-01-02T12:00:00Z") })
    ).resolves.toBeDefined();
  });
});

// This is the one remaining writer of the sink, so a refusal that does not hold here is
// cosmetic.
describe("a refusal holds on the one writer left", () => {
  it("reads nothing and stores nothing when the project switch is off", async () => {
    const sink = new InMemoryTelemetrySink();
    const journal = new InMemoryRunJournalReader();
    journal.set(SESSION_ID, {
      boundaries: [],
      filesWritten: [],
      taskDeclarations: [],
      session: {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: SESSION_ID,
      },
    });
    const refused = new StubTelemetryEvidenceReader();
    refused.enabled = false;
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      journal,
      NULL_PERSON_IDENTITY_READER,
      refused
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, env: {} });

    expect(result.sessions).toHaveLength(0);
    expect(result.refusedReason).toBeDefined();
    expect([...sink.files.values()].flat()).toHaveLength(0);
  });

  it("refuses even a direct --session read, which never touches the journal", async () => {
    const sink = new InMemoryTelemetrySink();
    const refused = new StubTelemetryEvidenceReader();
    refused.enabled = false;
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER,
      refused
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SESSION_ID,
    });

    expect(result.sessions).toHaveLength(0);
    expect([...sink.files.values()].flat()).toHaveLength(0);
  });
});

/** Which readers a session actually reaches. Reading every tool costs real time: the
 * OpenCode reader shells out and waits 1.15s for a session it does not have. */
describe("which readers a session reaches", () => {
  const SPIED_SESSION = "spied-session";
  const SUPPLIES = {
    tokenCounters: true,
    amount: false,
    toolStatedStep: false,
    agentName: false,
  } as const;

  let claudeConfig: AiTool<unknown>;
  let codexConfig: AiTool<unknown>;

  beforeEach(() => {
    claudeConfig = getAiToolConfig("claude");
    codexConfig = getAiToolConfig("codex");
    registerTool({ ...claudeConfig, telemetryLocalRead: { kind: "declared", supplies: SUPPLIES } });
    registerTool({ ...codexConfig, telemetryLocalRead: { kind: "declared", supplies: SUPPLIES } });
  });

  afterEach(() => {
    registerTool(claudeConfig);
    registerTool(codexConfig);
  });

  /** Records every session id it was asked about, so a test can assert on a reader that was
   * never reached rather than only on the answer it would have given. */
  function spyReader(): SessionCostReader & { readonly asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      read: async (sessionId: string) => {
        asked.push(sessionId);
        return { records: [], sessionFound: true };
      },
    };
  }

  function journalNaming(host: string): RunJournal {
    return {
      boundaries: [],
      filesWritten: [],
      taskDeclarations: [],
      session: {
        type: "session_start",
        at: "2026-03-02T08:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: host,
        vendor_id: SPIED_SESSION,
      },
    };
  }

  function useCaseWith(
    journalReader: typeof NULL_RUN_JOURNAL_READER,
    readers: ReadonlyMap<AiToolId, SessionCostReader>
  ): ReadLocalCostUseCase {
    return new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      readers,
      journalReader,
      NULL_PERSON_IDENTITY_READER,
      TELEMETRY_EVIDENCE_READER
    );
  }

  it("asks only the reader the journal named, and says so about the ones it skipped", async () => {
    const journals = new InMemoryRunJournalReader();
    journals.set(SPIED_SESSION, journalNaming("claude-code"));
    const claude = spyReader();
    const codex = spyReader();
    const useCase = useCaseWith(
      journals,
      new Map([
        ["claude", claude],
        ["codex", codex],
      ])
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SPIED_SESSION,
    });

    expect(claude.asked).toEqual([SPIED_SESSION]);
    expect(codex.asked).toEqual([]);
    expect(result.toolReports.find((r) => r.tool === "codex")?.status).toBe("not-asked");
  });

  it("never reports a skipped reader as having found no session", async () => {
    const journals = new InMemoryRunJournalReader();
    journals.set(SPIED_SESSION, journalNaming("claude-code"));
    const useCase = useCaseWith(journals, new Map([["claude", spyReader()]]));

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SPIED_SESSION,
    });

    // "no session found" is an observation: this tool was looked in and held nothing.
    // Nothing was looked in here, so nothing may claim it was.
    expect(result.toolReports.find((r) => r.tool === "codex")?.status).not.toBe("not-found");
  });

  it("still names a tool nothing can read, with its own declared reason, whoever the session belongs to", async () => {
    const journals = new InMemoryRunJournalReader();
    journals.set(SPIED_SESSION, journalNaming("claude-code"));
    const useCase = useCaseWith(journals, new Map([["claude", spyReader()]]));

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      env: {},
      sessionId: SPIED_SESSION,
    });

    // Cursor's declaration says its files carry no counter at all: a fact about the tool, true
    // of every session, and stronger than "not this session's tool".
    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.status).toBe("not-covered");
    expect(cursor?.reason).toBeTruthy();
  });

  it("asks every reader when no journal names a tool, since then none is ruled out", async () => {
    const claude = spyReader();
    const codex = spyReader();
    const useCase = useCaseWith(
      NULL_RUN_JOURNAL_READER,
      new Map([
        ["claude", claude],
        ["codex", codex],
      ])
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SPIED_SESSION });

    expect(claude.asked).toEqual([SPIED_SESSION]);
    expect(codex.asked).toEqual([SPIED_SESSION]);
  });

  it("asks every reader when the journal names a host no tool claims", async () => {
    const journals = new InMemoryRunJournalReader();
    journals.set(SPIED_SESSION, journalNaming("a-tool-nobody-registered"));
    const claude = spyReader();
    const codex = spyReader();
    const useCase = useCaseWith(
      journals,
      new Map([
        ["claude", claude],
        ["codex", codex],
      ])
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, env: {}, sessionId: SPIED_SESSION });

    expect(claude.asked).toEqual([SPIED_SESSION]);
    expect(codex.asked).toEqual([SPIED_SESSION]);
  });
});
