import { describe, expect, it } from "vitest";
import { ForgetTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/forget-telemetry-use-case.js";
import { telemetryRemovalIsEmpty } from "../../../../src/domain/models/telemetry-removal.js";
import type { TelemetrySinkRecord } from "../../../../src/domain/models/telemetry-sink-record.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { noGit } from "../helpers.js";

const PROJECT_ROOT = "/repo";
const RUNS_ENTRY = "aidd_docs/runs/";

const RECORD: TelemetrySinkRecord = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "export",
  tool: "claude",
  vendor_id: "s-1",
  vendor_field: "session.id",
  cost_usd: 1,
  step_attribution: "unattributed",
};

function buildUseCase() {
  const sink = new InMemoryTelemetrySink();
  const runJournalReader = new InMemoryRunJournalReader();
  const identity = new InMemoryPersonIdentityStore();
  const useCase = new ForgetTelemetryUseCase(sink, runJournalReader, identity, noGit);
  return { sink, runJournalReader, identity, useCase };
}

describe("ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched", () => {
  it("names the journal as this project's own, at its own resolved path", async () => {
    const { runJournalReader, useCase } = buildUseCase();
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.journal).toEqual({
      scope: "project",
      path: runJournalReader.runsDir,
      runFileNames: ["01ARZ3__abc.jsonl"],
    });
  });

  it("names the sink as this machine's own, spanning whatever it holds", async () => {
    const { sink, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.sink.scope).toBe("machine");
    expect(preview.sink.path).toBe(sink.rootDir);
    expect(preview.sink.dayFileNames).toEqual(["2026-08-20.jsonl"]);
  });

  it("reports an opted-in identity as present", async () => {
    const { identity, useCase } = buildUseCase();
    await identity.mint();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.identity).toEqual({
      scope: "machine",
      path: identity.filePath,
      present: true,
      unreadable: false,
    });
  });

  it("reports a damaged identity file as present, not absent", async () => {
    const { identity, useCase } = buildUseCase();
    identity.throwOnRead = new Error("torn file");
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.identity.present).toBe(true);
    expect(preview.identity.unreadable).toBe(true);
  });

  it("reports no identity at all as absent", async () => {
    const { useCase } = buildUseCase();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.identity.present).toBe(false);
  });

  it("reads history at its true strength: tracked now reads as certain", async () => {
    const sink = new InMemoryTelemetrySink();
    const runJournalReader = new InMemoryRunJournalReader();
    const identity = new InMemoryPersonIdentityStore();
    const git = { ...noGit, listTrackedFiles: async () => ["aidd_docs/runs/committed.jsonl"] };
    const useCase = new ForgetTelemetryUseCase(sink, runJournalReader, identity, git);
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({
      certainty: "tracked",
      files: ["aidd_docs/runs/committed.jsonl"],
    });
  });

  it("reads an untracked journal as possible, never as an all-clear", async () => {
    const { useCase } = buildUseCase();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({ certainty: "possible" });
  });

  it("asks listTrackedFiles about the journal's own pathspec", async () => {
    const sink = new InMemoryTelemetrySink();
    const runJournalReader = new InMemoryRunJournalReader();
    const identity = new InMemoryPersonIdentityStore();
    const seen: { repoRoot: string; pathspec: string }[] = [];
    const git = {
      ...noGit,
      listTrackedFiles: async (repoRoot: string, pathspec: string) => {
        seen.push({ repoRoot, pathspec });
        return [];
      },
    };
    const useCase = new ForgetTelemetryUseCase(sink, runJournalReader, identity, git);
    await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(seen).toEqual([{ repoRoot: PROJECT_ROOT, pathspec: RUNS_ENTRY }]);
  });

  it("a machine where nothing was ever measured has nothing to remove, and offers nothing", async () => {
    const { useCase } = buildUseCase();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(telemetryRemovalIsEmpty(preview)).toBe(true);
  });

  it("touches nothing: previewing leaves the sink, the journal and the identity exactly as they were", async () => {
    const { sink, runJournalReader, identity, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    await identity.mint();

    await useCase.preview({ projectRoot: PROJECT_ROOT });

    expect(sink.deletedFiles).toEqual([]);
    expect(await sink.listDayFiles()).toEqual(["2026-08-20.jsonl"]);
    expect(runJournalReader.runFileNames).toEqual(["01ARZ3__abc.jsonl"]);
    expect(identity.forgetCount).toBe(0);
    expect(await identity.read()).not.toBeNull();
  });
});
