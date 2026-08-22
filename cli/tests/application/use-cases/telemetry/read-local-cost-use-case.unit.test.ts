import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves each tool's local-read declaration from the
// registry, so every AI tool must be registered for these tests to see it.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReadLocalCostUseCase } from "../../../../src/application/use-cases/telemetry/read-local-cost-use-case.js";
import type { AiToolId } from "../../../../src/domain/models/tool-ids.js";
import type {
  LocalCostCandidateRecord,
  SessionCostReader,
} from "../../../../src/domain/ports/session-cost-reader.js";
import type { AiTool } from "../../../../src/domain/tools/contracts.js";
import { getAiToolConfig, registerTool } from "../../../../src/domain/tools/registry.js";
import {
  InMemoryPersonIdentityReader,
  NULL_PERSON_IDENTITY_READER,
} from "../../../helpers/ports/in-memory-person-identity-reader.js";
import {
  InMemoryRunJournalReader,
  NULL_RUN_JOURNAL_READER,
} from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const SESSION_ID = "s-1";

function stubReader(records: readonly LocalCostCandidateRecord[]): SessionCostReader {
  return {
    read: async (sessionId: string) =>
      sessionId === SESSION_ID
        ? { records, sessionFound: true }
        : { records: [], sessionFound: false },
  };
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

  // What this stub route supplies is not what this file is about; it declares the minimum
  // the type requires so the use case's own orchestration is what gets tested.
  const SUPPLIES_NOTHING = { tokenCounters: false, amount: false, toolStatedStep: false } as const;

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
      NULL_PERSON_IDENTITY_READER
    );

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
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    await useCase.execute({ sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect("person_id" in stored).toBe(false);
    expect("person_display_name" in stored).toBe(false);
  });

  it("stamps the identifier a person chose, and a display name only once they set one", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      new InMemoryPersonIdentityReader({ personId: "person-1" })
    );

    await useCase.execute({ sessionId: SESSION_ID });

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
      new InMemoryPersonIdentityReader({ personId: "person-1", displayName: "Baptiste" })
    );

    await useCase.execute({ sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.person_id).toBe("person-1");
    expect(stored.person_display_name).toBe("Baptiste");
  });

  // The spec's own line: a choice made today does not reach backwards. Re-reading an
  // already-stored session after opting in must not retroactively name it.
  it("leaves a session stored before opting in unnamed, even on a later read", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const identity = new InMemoryPersonIdentityReader(null);
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      identity
    );

    await useCase.execute({ sessionId: SESSION_ID });
    identity.set({ personId: "person-1" });
    await useCase.execute({ sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect("person_id" in stored).toBe(false);
  });

  // Task 2's own criterion: the use-case names the tool it asked, never the candidate
  // itself — `CANDIDATE` carries no `tool` field at all (the type omits it), so this is
  // structurally impossible for the reader to have supplied.
  it("stamps the tool it asked", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    await useCase.execute({ sessionId: SESSION_ID });

    const [stored] = [...sink.files.values()].flat();
    expect(stored.tool).toBe("claude");
  });

  // A reader cannot name its own tool, and the proof belongs to the compiler rather than
  // to a run: `LocalCostCandidateRecord` omits `tool`, so the attempt below does not
  // compile. `@ts-expect-error` inverts that into an assertion — the day the field becomes
  // settable, the directive has nothing to suppress and `tsc` fails on it. A runtime test
  // would have had to widen the type to build the value it forbids, which is the hole
  // being closed, not a way to check it is closed.
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
      NULL_PERSON_IDENTITY_READER
    );

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
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map(),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.status).toBe("not-covered");
    expect(cursor?.reason).toContain("token count");
  });

  it("reports an unmeasured tool as not-covered with no reason invented for it", async () => {
    // Every AI tool is either declared or explicitly unsupported as of phase 3, so
    // "unmeasured" is exercised here via an override rather than a real tool — the
    // use-case must still report it as not-covered, with no reason fabricated for a
    // fact that has not been established either way.
    registerTool({ ...claudeConfig, telemetryLocalRead: { kind: "unmeasured" } });
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map(),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude).toMatchObject({ status: "not-covered" });
    // The key is absent, not present-and-empty: this codebase omits rather than nulls, so
    // a reason that shows up as a blank line downstream is a bug, not a formatting choice.
    expect(claude).not.toHaveProperty("reason");
  });

  it("distinguishes not-covered from covered-and-empty", async () => {
    declareClaudeReadable();
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    await expect(useCase.execute({ sessionId: SESSION_ID })).resolves.toBeDefined();
    expect([...sink.files.values()].flat()).toHaveLength(1);
  });

  it("never synthesises a key for a candidate with no request identifier, and cannot dedup it", async () => {
    declareClaudeReadable();
    const noIdCandidate: LocalCostCandidateRecord = { ...CANDIDATE, turn_id: undefined };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([noIdCandidate])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored.step_attribution).toBe("unattributed");
      expect(stored.step).toBeUndefined();
    });

    // Task 3's own criterion: a journal interval covers the same moment too, and still
    // loses — the tool's own answer is exact, an interval is only ever an inference.
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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

      const [stored] = [...sink.files.values()].flat();
      expect(stored).toMatchObject({
        step_attribution: "tool-stated",
        step: "aidd-dev:02-implement",
      });
    });

    // Task 4's own criterion: attribution is an addition, never a precondition. The same
    // transcript, read with and without a journal beside it, must store the same figures.
    it("yields identical counters whether a journal is present or not", async () => {
      declareClaudeReadable();
      const withJournalSink = new InMemoryTelemetrySink();
      const withJournal = new ReadLocalCostUseCase(
        withJournalSink,
        new Map([["claude", stubReader([MOMENT_CANDIDATE])]]),
        journalWithOneStep("aidd-dev:06-test"),
        NULL_PERSON_IDENTITY_READER
      );
      const withoutJournalSink = new InMemoryTelemetrySink();
      const withoutJournal = new ReadLocalCostUseCase(
        withoutJournalSink,
        new Map([["claude", stubReader([MOMENT_CANDIDATE])]]),
        NULL_RUN_JOURNAL_READER,
        NULL_PERSON_IDENTITY_READER
      );

      await withJournal.execute({ sessionId: SESSION_ID });
      await withoutJournal.execute({ sessionId: SESSION_ID });

      const [withStored] = [...withJournalSink.files.values()].flat();
      const [withoutStored] = [...withoutJournalSink.files.values()].flat();
      const counters = (record: typeof withStored) => ({
        input_tokens: record.input_tokens,
        output_tokens: record.output_tokens,
        cache_read_tokens: record.cache_read_tokens,
        cache_creation_tokens: record.cache_creation_tokens,
      });
      expect(counters(withStored)).toEqual(counters(withoutStored));
      // The one thing that does differ is the attribution itself.
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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
        NULL_PERSON_IDENTITY_READER
      );

      await useCase.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    const opencode = (await useCase.execute({ sessionId: SESSION_ID })).toolReports.find(
      (report) => report.tool === "opencode"
    );

    expect(opencode?.status).toBe("unreadable");
    expect(opencode?.reason).toBe(BOOM);
  });

  it("is a fifth answer, never one of the four that already exist", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["opencode", throwingReader()]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    const opencode = (await useCase.execute({ sessionId: SESSION_ID })).toolReports.find(
      (report) => report.tool === "opencode"
    );

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
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: SESSION_ID });

    expect([...sink.files.values()].flat()).toEqual([]);
    const failed = result.toolReports.filter((report) =>
      ["opencode", "claude"].includes(report.tool)
    );
    expect(failed.map((report) => report.status)).toEqual(["unreadable", "unreadable"]);
    expect(failed.every((report) => report.recordsFound === 0)).toBe(true);
    // Nothing anywhere in the answer claims a tool cost zero.
    expect(result.toolReports.some((report) => report.status === "empty")).toBe(false);
  });

  it("stores what a failed read missed, once the reader recovers", async () => {
    const sink = new InMemoryTelemetrySink();
    const failing = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", throwingReader()]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );
    await failing.execute({ sessionId: SESSION_ID });

    const recovered = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );
    const result = await recovered.execute({ sessionId: SESSION_ID });

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
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({});

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["s-a", "s-b"]);
    expect([...sink.files.values()].flat()).toHaveLength(2);
  });

  it("reads only the session named, when one is", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["claude", readerFor(new Map([["s-a", [CANDIDATE]]]))]]),
      journalNaming("s-a", "s-b"),
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({ sessionId: "s-a" });

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["s-a"]);
  });

  it("reads nothing, without failing, when the journal names no session", async () => {
    const useCase = new ReadLocalCostUseCase(
      new InMemoryTelemetrySink(),
      new Map([["claude", stubReader([CANDIDATE])]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    expect(await useCase.execute({})).toEqual({ sessions: [], toolReports: expect.anything() });
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
      NULL_PERSON_IDENTITY_READER
    );
    await useCase.execute({});

    const second = await useCase.execute({});

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
      NULL_PERSON_IDENTITY_READER
    );

    const result = await useCase.execute({});

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
      NULL_PERSON_IDENTITY_READER
    );

    const claude = (await useCase.execute({})).toolReports.find(
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
    // Nineteen good sessions and one bad is the case that matters: the figures are real,
    // so the status is honest, and a failure visible only in the status would vanish
    // exactly where there is most to lose.
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
      NULL_PERSON_IDENTITY_READER
    );

    const claude = (await useCase.execute({})).toolReports.find(
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
      NULL_PERSON_IDENTITY_READER
    );

    const claude = (await useCase.execute({ sessionId: SESSION_ID })).toolReports.find(
      (report) => report.tool === "claude"
    );

    expect(claude?.sessionsFailed).toBe(0);
    expect(claude?.failureReason).toBeUndefined();
  });
});
