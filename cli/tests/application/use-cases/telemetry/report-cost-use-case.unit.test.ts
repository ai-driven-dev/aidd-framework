import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReportCostUseCase } from "../../../../src/application/use-cases/telemetry/report-cost-use-case.js";
import { toMicroUsd } from "../../../../src/domain/models/cost-report.js";
import type { TelemetrySinkRecord } from "../../../../src/domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../../src/domain/models/tool-ids.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const PERIOD = { fromDay: "2026-08-17", toDay: "2026-08-21" } as const;
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
  let useCase: ReportCostUseCase;

  beforeEach(() => {
    sink = new InMemoryTelemetrySink();
    journals = new InMemoryRunJournalReader();
    identity = new InMemoryPersonIdentityStore();
    useCase = new ReportCostUseCase(sink, journals, identity);
  });

  async function store(...records: readonly TelemetrySinkRecord[]): Promise<void> {
    for (const stored of records) await sink.appendRecord(stored, STORED_ON);
  }

  it("reports a period from what the sink holds, whatever session it belongs to", async () => {
    await store(
      record({ vendor_id: "s-1", cost_usd: 0.1 }),
      record({ vendor_id: "s-2", cost_usd: 0.2 })
    );

    const built = await useCase.execute({ period: PERIOD });

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

    const built = await useCase.execute({ period: PERIOD });

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

    const built = await useCase.execute({ period: PERIOD, task: TASK });

    expect(built.task).toBe(TASK);
    expect(built.totals.costMicroUsd).toBe(toMicroUsd(1));
  });

  it("gives every declared tool a row, with the reason an unreadable one cannot be read", async () => {
    await store(record({ cost_usd: 1 }));

    const built = await useCase.execute({ period: PERIOD });

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

    const built = await useCase.execute({ period: PERIOD });

    expect(built.undatedRecords).toBe(1);
    expect(built.totals.requests).toBe(1);
  });

  it("answers an empty period with an empty report and no error", async () => {
    const built = await useCase.execute({ period: PERIOD });

    expect(built.sessions).toBe(0);
    expect(built.totals).toEqual({ requests: 0 });
    expect(built.byTools.every((row) => row.totals.requests === 0)).toBe(true);
  });

  it("reports a period whose sessions have no journal at all", async () => {
    await store(record({ cost_usd: 1 }));

    expect((await useCase.execute({ period: PERIOD })).totals.requests).toBe(1);
  });

  it("resolves byPeople against the identity this store holds", async () => {
    identity = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "adopted",
      alsoMe: ["machine-1"],
    });
    useCase = new ReportCostUseCase(sink, journals, identity);
    await store(record({ vendor_id: "s-1", cost_usd: 1, person_id: "machine-1" }));

    const built = await useCase.execute({ period: PERIOD });

    const mapped = built.byPeople.find((row) => row.resolution === "mapped");
    expect(mapped?.person).toBe("person-a");
  });

  it("survives an identity that cannot be read, reporting every figure with the caveat set", async () => {
    identity.throwOnRead = new Error("identity.json does not parse");
    await store(record({ vendor_id: "s-1", cost_usd: 1, person_id: "machine-1" }));

    const built = await useCase.execute({ period: PERIOD });

    expect(built.totals.requests).toBe(1);
    expect(built.personMappingUnreadable).toBe(true);
    expect(built.byPeople.every((row) => row.resolution !== "mapped")).toBe(true);
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
