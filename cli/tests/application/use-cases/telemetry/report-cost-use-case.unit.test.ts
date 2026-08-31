import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReportCostUseCase } from "../../../../src/application/use-cases/telemetry/report-cost-use-case.js";
import { UnreadableIdentityFileError } from "../../../../src/domain/errors.js";
import { toMicroUsd } from "../../../../src/domain/models/cost-report.js";
import { taskFolderPathFromIdentity } from "../../../../src/domain/models/task-backlog-link.js";
import type { TelemetrySinkRecord } from "../../../../src/domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../../src/domain/models/tool-ids.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTaskBacklogReader } from "../../../helpers/ports/in-memory-task-backlog-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { StubTelemetryEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

const PERIOD = { fromDay: "2026-08-17", toDay: "2026-08-21" } as const;
// `execute()` now also asks whether the project switch is on - every test in this file is
// about what the sink and the journal hold, not about that switch, so it always answers
// "on" here and passes a fixed root and an empty env just to satisfy the shape.
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

  it("resolves the declaration through TaskBacklogReader, keyed on the folder the task identity resolves to", async () => {
    // Pins the wiring `distinctTaskIdentities` -> `taskFolderPathFromIdentity` ->
    // `TaskBacklogReader.read` actually performs: the double is set on the exact folder
    // path a real adapter would be asked to read, never on the bare task identity string.
    journals.set("s-task", {
      boundaries: [],
      session: {
        type: "session_start",
        at: "2026-08-18T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        tool: "claude-code",
        vendor_id: "s-task",
      },
      // A witnessed moment after the record's own timestamp - without one, the declared
      // interval's own end collapses to its start (buildTaskIntervals's own documented
      // behaviour), and the record below would fall outside it.
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
          "../../../../src/application/use-cases/telemetry/report-cost-use-case.ts",
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
