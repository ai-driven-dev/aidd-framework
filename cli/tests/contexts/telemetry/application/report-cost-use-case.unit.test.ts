import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { ReadLocalCostUseCase } from "../../../../src/contexts/telemetry/application/read-local-cost-use-case.js";
import { ReportCostUseCase } from "../../../../src/contexts/telemetry/application/report-cost-use-case.js";
import { toMicroUsd } from "../../../../src/contexts/telemetry/domain/cost-report.js";
import type { RunJournal } from "../../../../src/contexts/telemetry/domain/ports/run-journal-reader.js";
import type { LocalCostCandidateRecord } from "../../../../src/contexts/telemetry/domain/ports/session-cost-reader.js";
import { taskFolderPathFromIdentity } from "../../../../src/contexts/telemetry/domain/task-backlog-link.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { UnreadableIdentityFileError } from "../../../../src/kernel/errors.js";
import { AI_TOOL_IDS } from "../../../../src/kernel/tool.js";
import { NULL_PERSON_IDENTITY_READER } from "../../../helpers/ports/in-memory-person-identity-reader.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTaskBacklogReader } from "../../../helpers/ports/in-memory-task-backlog-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { StubTelemetryEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

const PERIOD = { fromDay: "2026-08-17", toDay: "2026-08-21" } as const;
// Every test here is about what the sink and the journal hold, not the project switch: the
// fixed root and empty env only satisfy `execute()`'s shape.
const BASE_OPTIONS = { projectRoot: "/project", env: {} } as const;
const STORED_ON = new Date("2026-08-21T09:00:00Z");
const TASK = "2026_08/2026_08_21_cost-reporter";

function record(overrides: Partial<TelemetrySinkRecord>): TelemetrySinkRecord {
  return {
    sink_schema_version: 2,
    kind: "request",
    provenance: "local-read",
    tool: "claude",
    vendor_id: "s-1",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
    event_timestamp: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("ReportCostUseCase", () => {
  let sink: InMemoryTelemetrySink;
  let journals: InMemoryRunJournalReader;
  let identity: InMemoryPersonIdentityStore;
  let evidence: StubTelemetryEvidenceReader;
  let taskBacklog: InMemoryTaskBacklogReader;
  let useCase: ReportCostUseCase;

  beforeEach(() => {
    sink = new InMemoryTelemetrySink();
    journals = new InMemoryRunJournalReader();
    identity = new InMemoryPersonIdentityStore();
    evidence = new StubTelemetryEvidenceReader();
    taskBacklog = new InMemoryTaskBacklogReader();
    useCase = new ReportCostUseCase(sink, journals, identity, evidence, taskBacklog);
  });

  async function store(...records: readonly TelemetrySinkRecord[]): Promise<void> {
    for (const stored of records) await sink.appendRecord(stored, STORED_ON);
  }

  it("reports a period from what the sink holds, whatever session it belongs to", async () => {
    await store(
      record({ vendor_id: "s-1", cost_usd: 0.1 }),
      record({ vendor_id: "s-2", cost_usd: 0.2 })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.sessions).toBe(2);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(0.3));
    expect([built.fromDay, built.toDay]).toEqual(["2026-08-17", "2026-08-21"]);
  });

  it("leaves out work that happened before the period, however recently it was stored", async () => {
    // Both lines are appended on the same day; only their own moments differ.
    await store(
      record({ vendor_id: "july", cost_usd: 9, event_timestamp: "2026-07-29T15:12:27.889Z" }),
      record({ vendor_id: "august", cost_usd: 1 })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.costMicroUsd).toBe(toMicroUsd(1));
    expect(built.sessions).toBe(1);
  });

  it("restricts to the sessions that wrote into the task asked for", async () => {
    journals.set("s-task", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: "s-task",
      },
      filesWritten: [
        {
          type: "file_written",
          at: "2026-08-18T09:30:00Z",
          path: `aidd_docs/tasks/${TASK}/plan.md`,
        },
      ],
      taskDeclarations: [],
    });
    await store(
      record({ vendor_id: "s-task", cost_usd: 1 }),
      record({ vendor_id: "s-elsewhere", cost_usd: 8 })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD, task: TASK });

    expect(built.task).toBe(TASK);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(1));
  });

  // The second record predates the journal's own span, so no written-file inference can
  // reach it however many files that session went on to write.
  it("names a record inside the journal's span after the only task folder that session wrote into", async () => {
    journals.set("s-inferred", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: "s-inferred",
      },
      filesWritten: [
        {
          type: "file_written",
          at: "2026-08-18T09:30:00Z",
          path: `aidd_docs/tasks/${TASK}/plan.md`,
        },
      ],
      taskDeclarations: [],
    });
    await store(
      record({
        vendor_id: "s-inferred",
        cost_usd: 1,
        event_timestamp: "2026-08-18T09:15:00Z",
      }),
      record({
        vendor_id: "s-inferred",
        cost_usd: 2,
        event_timestamp: "2026-08-17T09:15:00Z",
      })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    const inferred = built.byTasks.find((row) => row.attribution === "inferred");
    expect(inferred?.task).toBe(TASK);
    expect(inferred?.totals.costMicroUsd).toBe(toMicroUsd(1));
    expect(built.byTasks.some((row) => row.reason !== undefined)).toBe(true);
  });

  it("gives every declared tool a row, with the reason an unreadable one cannot be read", async () => {
    await store(record({ cost_usd: 1 }));

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.byTools.map((row) => row.tool)).toEqual([...AI_TOOL_IDS]);
    const cursor = built.byTools.find((row) => row.tool === "cursor");
    expect(cursor?.coverage).toBe("not-covered");
    expect(cursor?.reason).toBeTruthy();
  });

  it("reports what the read could not place or could not parse", async () => {
    await store(
      record({ cost_usd: 1 }),
      record({ vendor_id: "no-moment", event_timestamp: undefined })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.undatedRecords).toBe(1);
    expect(built.totals.requests).toBe(1);
  });

  it("answers an empty period with an empty report and no error", async () => {
    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.sessions).toBe(0);
    expect(built.totals).toEqual({ requests: 0 });
    expect(built.byTools.every((row) => row.totals.requests === 0)).toBe(true);
  });

  it("reports a period whose sessions have no journal at all", async () => {
    await store(record({ cost_usd: 1 }));

    expect((await useCase.execute({ ...BASE_OPTIONS, period: PERIOD })).totals.requests).toBe(1);
  });

  it("resolves byPeople against the identity this store holds", async () => {
    identity = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "adopted",
      alsoMe: ["machine-1"],
    });
    useCase = new ReportCostUseCase(
      sink,
      journals,
      identity,
      evidence,
      new InMemoryTaskBacklogReader()
    );
    await store(record({ vendor_id: "s-1", cost_usd: 1, person_id: "machine-1" }));

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    const mapped = built.byPeople.find((row) => row.resolution === "mapped");
    expect(mapped?.person).toBe("person-a");
  });

  it("survives an identity that cannot be read, reporting every figure with the caveat set", async () => {
    identity.throwOnRead = new UnreadableIdentityFileError(identity.filePath, "EISDIR");
    await store(record({ vendor_id: "s-1", cost_usd: 1, person_id: "machine-1" }));

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.requests).toBe(1);
    expect(built.identityUnusableCause).toBe("unreadable");
    expect(built.byPeople.every((row) => row.resolution !== "mapped")).toBe(true);
  });

  it("reports no identity declared as its own cause, distinct from unreadable", async () => {
    await store(record({ vendor_id: "s-1", cost_usd: 1, person_id: "machine-1" }));

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.identityUnusableCause).toBe("absent");
  });

  it("reports whether the project switch is on, from the evidence reader alone", async () => {
    evidence.enabled = false;

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.measurementEnabled).toBe(false);
  });

  it("reports the switch as on when the evidence reader says so, even with nothing measured", async () => {
    evidence.enabled = true;

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.measurementEnabled).toBe(true);
    expect(built.totals.requests).toBe(0);
  });

  it("re-throws an error it does not recognise rather than mislabelling it as a named cause", async () => {
    identity.throwOnRead = new Error("some other failure entirely");

    await expect(useCase.execute({ ...BASE_OPTIONS, period: PERIOD })).rejects.toThrow(
      "some other failure entirely"
    );
  });

  // A journal moment is second-precision — the writing hook strips the milliseconds — while
  // a record keeps them, so a record landing in that same second still counts as inside.
  it("counts a record inside the last second its journal wrote as witnessed", async () => {
    journals.set("s-same-second", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
        tool: "claude-code",
        vendor_id: "s-same-second",
      },
      filesWritten: [
        {
          type: "file_written",
          at: "2026-08-18T09:30:00Z",
          path: `aidd_docs/tasks/${TASK}/plan.md`,
        },
      ],
      taskDeclarations: [],
    });
    await store(
      record({
        vendor_id: "s-same-second",
        cost_usd: 5,
        event_timestamp: "2026-08-18T09:30:00.351Z",
      })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.byTasks.find((row) => row.attribution === "inferred")?.task).toBe(TASK);
  });

  it("resolves the backlog declaration of a task no interval ever declared", async () => {
    journals.set("s-written-only", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
        tool: "claude-code",
        vendor_id: "s-written-only",
      },
      filesWritten: [
        {
          type: "file_written",
          at: "2026-08-18T09:40:00Z",
          path: `aidd_docs/tasks/${TASK}/plan.md`,
        },
      ],
      taskDeclarations: [],
    });
    taskBacklog.set(taskFolderPathFromIdentity(TASK), {
      kind: "declared",
      link: { backlog: "acme/widgets#742", writtenAt: "2026-08-18T09:00:00Z", writtenBy: "x" },
    });
    await store(
      record({
        vendor_id: "s-written-only",
        cost_usd: 3,
        event_timestamp: "2026-08-18T09:20:00Z",
      })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.byBacklog.map((row) => row.backlog)).toContain("acme/widgets#742");
  });

  it("resolves the declaration through TaskBacklogReader, keyed on the folder the task identity resolves to", async () => {
    // The double is set on the exact folder path a real adapter would be asked to read,
    // never on the bare task identity string.
    journals.set("s-task", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        tool: "claude-code",
        vendor_id: "s-task",
      },
      // A witnessed moment after the record's own timestamp: without one the declared
      // interval's end collapses to its start and the record below falls outside it.
      filesWritten: [
        {
          type: "file_written",
          at: "2026-08-18T09:40:00Z",
          path: `aidd_docs/tasks/${TASK}/plan.md`,
        },
      ],
      taskDeclarations: [
        {
          type: "task_declared",
          at: "2026-08-18T09:00:00Z",
          path: `aidd_docs/tasks/${TASK}/spec.md`,
        },
      ],
    });
    taskBacklog.set(taskFolderPathFromIdentity(TASK), {
      kind: "declared",
      link: {
        backlog: "acme/widgets#661",
        writtenAt: "2026-08-18T08:00:00Z",
        writtenBy: "aidd-pm:04-spec",
      },
    });
    await store(
      record({ vendor_id: "s-task", cost_usd: 4, event_timestamp: "2026-08-18T09:30:00Z" })
    );

    const built = await useCase.execute({ ...BASE_OPTIONS, period: PERIOD });

    const named = built.byBacklog.find((row) => row.backlog === "acme/widgets#661");
    expect(named?.totals.requests).toBe(1);
    expect(named?.totals.costMicroUsd).toBe(toMicroUsd(4));
  });

  it("names no tool, by string literal", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../src/contexts/telemetry/application/report-cost-use-case.ts",
          import.meta.url
        )
      ),
      "utf8"
    );

    for (const toolId of AI_TOOL_IDS) {
      expect(source).not.toContain(`"${toolId}"`);
      expect(source).not.toContain(`'${toolId}'`);
    }
  });
});

describe("a report that catches the sink up first", () => {
  const SESSION = "s-catch-up";
  const AT = "2026-08-18T10:00:00.000Z";

  let sink: InMemoryTelemetrySink;
  let journals: InMemoryRunJournalReader;
  let evidence: StubTelemetryEvidenceReader;

  function journalAt(at: string): RunJournal {
    return {
      boundaries: [],
      filesWritten: [],
      taskDeclarations: [],
      session: {
        type: "session_start",
        at,
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: SESSION,
      },
    };
  }

  /** The real local read over in-memory ports, never a double: a stand-in could be made to
   * show `report` reaching the read whether or not it does. */
  function localRead(records: readonly LocalCostCandidateRecord[]): ReadLocalCostUseCase {
    return new ReadLocalCostUseCase(
      sink,
      new Map([["claude", { read: async () => ({ records, sessionFound: true }) }]]),
      journals,
      NULL_PERSON_IDENTITY_READER,
      evidence
    );
  }

  function reportWith(read?: ReadLocalCostUseCase): ReportCostUseCase {
    return new ReportCostUseCase(
      sink,
      journals,
      new InMemoryPersonIdentityStore(),
      evidence,
      new InMemoryTaskBacklogReader(),
      read
    );
  }

  const CANDIDATE: LocalCostCandidateRecord = {
    kind: "request",
    vendor_id: SESSION,
    vendor_field: "sessionId",
    turn_id: "t-1",
    event_timestamp: AT,
    input_tokens: 100,
    output_tokens: 10,
  };

  beforeEach(() => {
    sink = new InMemoryTelemetrySink();
    journals = new InMemoryRunJournalReader();
    evidence = new StubTelemetryEvidenceReader();
  });

  it("reports a journalled session nobody ran a read for", async () => {
    journals.set(SESSION, journalAt(AT));

    const built = await reportWith(localRead([CANDIDATE])).execute({
      ...BASE_OPTIONS,
      period: PERIOD,
    });

    expect(built.totals.requests).toBe(1);
    expect(built.totals.inputTokens).toBe(100);
  });

  it("reports only what the sink holds when no read was wired, rather than guessing", async () => {
    journals.set(SESSION, journalAt(AT));

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.requests).toBe(0);
  });

  // A journal can disappear while its records stay: `aidd_docs/runs/` is git-ignored, so a
  // clean checkout holds the figures and none of the boundaries.
  it("keeps a stored step for a session the period's journals say nothing about", async () => {
    await sink.appendRecord(
      record({
        vendor_id: "s-no-journal",
        event_timestamp: "2026-08-18T10:00:00.000Z",
        step_attribution: "journal-interval",
        step: "aidd-dev:05-review",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "journal-interval", step: "aidd-dev:05-review" })
    );
  });

  it("leaves a tool-stated step alone, even where the journal's interval names another", async () => {
    const journal = journalAt("2026-08-18T09:00:00Z");
    journals.set(SESSION, {
      ...journal,
      boundaries: [
        { type: "step_start", at: "2026-08-18T09:30:00Z", skill: "aidd-dev:02-implement" },
      ],
    });
    await sink.appendRecord(
      record({
        vendor_id: SESSION,
        event_timestamp: "2026-08-18T10:00:00.000Z",
        step_attribution: "tool-stated",
        step: "aidd-vcs:01-commit",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "tool-stated", step: "aidd-vcs:01-commit" })
    );
  });

  // The record's moment falls outside every interval, so only the prompt both sides name can
  // attribute it; three steps really do open under one prompt on a measured live session.
  it("names the step a shared prompt opened first, never the last to reuse it", async () => {
    const journal = journalAt("2026-08-18T09:00:00Z");
    journals.set(SESSION, {
      ...journal,
      boundaries: [
        {
          type: "step_start",
          at: "2026-08-18T11:00:00Z",
          skill: "aidd-pm:04-spec",
          turn_id: "p-abc",
        },
        {
          type: "step_start",
          at: "2026-08-18T11:30:00Z",
          skill: "aidd-dev:01-plan",
          turn_id: "p-abc",
        },
      ],
    });
    await sink.appendRecord(
      record({
        vendor_id: SESSION,
        event_timestamp: "2026-08-18T10:00:00.000Z",
        prompt_id: "p-abc",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "prompt-matched", step: "aidd-pm:04-spec" })
    );
  });

  it("attributes on the prompt both sides name, where no interval covers the moment", async () => {
    const journal = journalAt("2026-08-18T09:00:00Z");
    journals.set(SESSION, {
      ...journal,
      boundaries: [
        {
          type: "step_start",
          at: "2026-08-18T11:00:00Z",
          skill: "aidd-dev:02-implement",
          turn_id: "p-abc",
        },
      ],
    });
    await sink.appendRecord(
      record({
        vendor_id: SESSION,
        // Before the step ever opened: no interval can reach it.
        event_timestamp: "2026-08-18T10:00:00.000Z",
        prompt_id: "p-abc",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "prompt-matched", step: "aidd-dev:02-implement" })
    );
  });

  /** The journal never opened the step because the hook was not installed when the session
   * ran; the record still carries the skill its own transcript named for that prompt. */
  it("attributes on the skill the record's own prompt invoked, where no journal saw it", async () => {
    journals.set(SESSION, journalAt("2026-08-18T09:00:00Z"));
    await sink.appendRecord(
      record({
        vendor_id: SESSION,
        event_timestamp: "2026-08-18T10:00:00.000Z",
        prompt_id: "p-abc",
        prompt_skill: "aidd-dev:01-plan",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "prompt-matched", step: "aidd-dev:01-plan" })
    );
  });

  // The journal was written by a hook the host itself fired while the transcript is read back
  // afterwards, so the reading with a witness wins.
  it("keeps the journal's own answer when both sides name a skill for the same prompt", async () => {
    const journal = journalAt("2026-08-18T09:00:00Z");
    journals.set(SESSION, {
      ...journal,
      boundaries: [
        {
          type: "step_start",
          at: "2026-08-18T11:00:00Z",
          skill: "aidd-pm:04-spec",
          turn_id: "p-abc",
        },
      ],
    });
    await sink.appendRecord(
      record({
        vendor_id: SESSION,
        event_timestamp: "2026-08-18T10:00:00.000Z",
        prompt_id: "p-abc",
        prompt_skill: "aidd-dev:01-plan",
      }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "prompt-matched", step: "aidd-pm:04-spec" })
    );
  });

  it("derives a stored record's step from the journal rather than trusting the stored one", async () => {
    const at = "2026-08-18T10:00:00.000Z";
    const journal = journalAt("2026-08-18T09:00:00Z");
    journals.set(SESSION, {
      ...journal,
      // The pause after the record is what the step is capped at: a step runs past a pause
      // but never past the last moment its own journal witnessed.
      boundaries: [
        { type: "step_start", at: "2026-08-18T09:30:00Z", skill: "aidd-dev:02-implement" },
        { type: "turn_end", at: "2026-08-18T10:30:00Z" },
      ],
    });
    await sink.appendRecord(
      record({ vendor_id: SESSION, event_timestamp: at, step_attribution: "unattributed" }),
      STORED_ON
    );

    const built = await reportWith().execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.bySteps).toContainEqual(
      expect.objectContaining({ attribution: "journal-interval", step: "aidd-dev:02-implement" })
    );
  });

  // `groupByTurnId` indexes nothing without a `turn_id`, so re-reading a session whose
  // records carry none would append them a second time.
  it("leaves a session alone when its stored records carry no turn id to match on", async () => {
    journals.set(SESSION, journalAt(AT));
    await sink.appendRecord(record({ vendor_id: SESSION, event_timestamp: AT }), STORED_ON);
    let reads = 0;
    const counting = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          {
            read: async () => {
              reads += 1;
              return { records: [CANDIDATE], sessionFound: true };
            },
          },
        ],
      ]),
      journals,
      NULL_PERSON_IDENTITY_READER,
      evidence
    );

    await reportWith(counting).execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(reads).toBe(0);
  });

  it("reads a stored session again, so a live session's later turns land", async () => {
    journals.set(SESSION, journalAt(AT));
    // A `turn_id` is what makes a re-read reconcilable rather than duplicating.
    await sink.appendRecord(
      record({ vendor_id: SESSION, event_timestamp: AT, turn_id: "req_1" }),
      STORED_ON
    );
    let reads = 0;
    const counting = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          {
            read: async () => {
              reads += 1;
              return { records: [CANDIDATE], sessionFound: true };
            },
          },
        ],
      ]),
      journals,
      NULL_PERSON_IDENTITY_READER,
      evidence
    );

    await reportWith(counting).execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(reads).toBe(1);
  });

  it("reaches a session journalled on the last day of the period, which runs to midnight", async () => {
    // The bound is the first instant after `toDay`, not `toDay` at 00:00: getting it wrong
    // drops the whole last day, which `--days N` always makes today.
    journals.set(SESSION, journalAt(`${PERIOD.toDay}T23:59:59.999Z`));

    const built = await reportWith(
      localRead([{ ...CANDIDATE, event_timestamp: `${PERIOD.toDay}T23:59:59.999Z` }])
    ).execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.requests).toBe(1);
  });

  it("reaches a session journalled at the very first instant of the period", async () => {
    journals.set(SESSION, journalAt(`${PERIOD.fromDay}T00:00:00.000Z`));

    const built = await reportWith(
      localRead([{ ...CANDIDATE, event_timestamp: `${PERIOD.fromDay}T00:00:00.000Z` }])
    ).execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.requests).toBe(1);
  });

  it("never reaches for a session journalled the instant the period ends", async () => {
    // Midnight opening the day after `toDay` is the first moment outside, not the last one
    // inside — the half a `>` instead of a `>=` would silently widen.
    const dayAfter = new Date(Date.parse(`${PERIOD.toDay}T00:00:00Z`) + 86_400_000);
    journals.set(SESSION, journalAt(dayAfter.toISOString()));

    const built = await reportWith(localRead([CANDIDATE])).execute({
      ...BASE_OPTIONS,
      period: PERIOD,
    });

    expect(built.totals.requests).toBe(0);
  });

  it("never reaches for a session whose own moment falls outside the period asked about", async () => {
    // Otherwise catching up would cost with the age of the repository rather than with the
    // length of the period asked about.
    journals.set(SESSION, journalAt("2020-01-01T00:00:00.000Z"));

    const built = await reportWith(localRead([CANDIDATE])).execute({
      ...BASE_OPTIONS,
      period: PERIOD,
    });

    expect(built.totals.requests).toBe(0);
  });

  it("deletes no stored day file, since a question is not housekeeping", async () => {
    // `read` prunes past its retention window, which is housekeeping; behind a report that
    // would delete measurement as a side effect of being asked a question.
    journals.set(SESSION, journalAt(AT));
    for (let day = 1; day <= 120; day += 1) {
      const stamp = new Date(Date.UTC(2025, 0, day));
      await sink.appendRecord(record({ vendor_id: `old-${day}` }), stamp);
    }
    const before = await sink.listDayFiles();

    await reportWith(localRead([CANDIDATE])).execute({ ...BASE_OPTIONS, period: PERIOD });

    // Asserted as "none of these is gone", not as an unchanged count: the catch-up stores
    // what it reads, so it adds a day file of its own.
    const after = new Set(await sink.listDayFiles());
    expect(before.filter((file) => !after.has(file))).toEqual([]);
  });

  it("says what a reader could not answer, rather than reporting the silence as no spend", async () => {
    // A period where every reader threw would otherwise print exactly what a period with no
    // spend prints, and nobody sees the read surface's own output behind a report.
    journals.set(SESSION, journalAt(AT));
    const warnings: string[] = [];
    const throwing = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          {
            read: async () => {
              throw new Error("the transcript directory is unreadable");
            },
          },
        ],
      ]),
      journals,
      NULL_PERSON_IDENTITY_READER,
      evidence
    );
    const report = new ReportCostUseCase(
      sink,
      journals,
      new InMemoryPersonIdentityStore(),
      evidence,
      new InMemoryTaskBacklogReader(),
      throwing,
      { debug: () => {}, info: () => {}, warn: (m: string) => warnings.push(m) }
    );

    const built = await report.execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(built.totals.requests).toBe(0);
    expect(warnings.join("\n")).toContain("the transcript directory is unreadable");
  });

  it("skips a journal whose own moment cannot be read at all, rather than treating it as now", async () => {
    journals.set(SESSION, journalAt("not a moment"));

    const built = await reportWith(localRead([CANDIDATE])).execute({
      ...BASE_OPTIONS,
      period: PERIOD,
    });

    expect(built.totals.requests).toBe(0);
  });

  it("opens no tool's files at all when the project switch is off", async () => {
    // Asserted on whether the reader was reached, not on the total: a refused catch-up and
    // an absent one both report zero, so a total cannot tell them apart.
    journals.set(SESSION, journalAt(AT));
    let reads = 0;
    const counting = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          {
            read: async () => {
              reads += 1;
              return { records: [CANDIDATE], sessionFound: true };
            },
          },
        ],
      ]),
      journals,
      NULL_PERSON_IDENTITY_READER,
      evidence
    );

    evidence.enabled = true;
    await reportWith(counting).execute({ ...BASE_OPTIONS, period: PERIOD });
    const readWhenOn = reads;

    sink = new InMemoryTelemetrySink();
    reads = 0;
    evidence.enabled = false;
    await reportWith(counting).execute({ ...BASE_OPTIONS, period: PERIOD });

    expect(readWhenOn).toBeGreaterThan(0);
    expect(reads).toBe(0);
  });
});
