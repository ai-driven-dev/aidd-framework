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

describe("ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution", () => {
  it("removes exactly the run files, day files and identity the preview named, and reports matching counts", async () => {
    const { sink, runJournalReader, identity, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-19T00:00:00.000Z"));
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    await identity.mint();

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.journal).toEqual({ removed: 1, failed: [] });
    expect(result.sink).toEqual({ removed: 2, failed: [] });
    expect(result.identity).toEqual({ removed: 1, failed: [] });
    expect(await sink.listDayFiles()).toEqual([]);
    expect(runJournalReader.runFileNames).toEqual([]);
    expect(await identity.read()).toBeNull();
  });

  it("a location that refuses removal is reported, and every other location is still emptied", async () => {
    const { sink, runJournalReader, identity, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-19T00:00:00.000Z"));
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    sink.undeletable.add("2026-08-19.jsonl");
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    await identity.mint();

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.sink.removed).toBe(1);
    expect(result.sink.failed).toEqual([
      { path: "2026-08-19.jsonl", reason: "cannot delete 2026-08-19.jsonl" },
    ]);
    // The other locations were not spared by the sink's failure.
    expect(result.journal).toEqual({ removed: 1, failed: [] });
    expect(result.identity).toEqual({ removed: 1, failed: [] });
    expect(await sink.listDayFiles()).toEqual(["2026-08-19.jsonl"]);
  });

  it("a journal run file that refuses removal is reported, and the sink still empties", async () => {
    const { sink, runJournalReader, identity, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    runJournalReader.undeletable.add("01ARZ3__abc.jsonl");

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.journal.removed).toBe(0);
    expect(result.journal.failed).toEqual([
      { path: "01ARZ3__abc.jsonl", reason: "cannot delete 01ARZ3__abc.jsonl" },
    ]);
    expect(result.sink).toEqual({ removed: 1, failed: [] });
    expect(identity.forgetCount).toBe(1);
  });

  it("an identity that refuses removal is reported, and the other locations still empty", async () => {
    const { sink, identity, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    await identity.mint();
    identity.throwOnForget = new Error("permission denied");

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.identity).toEqual({
      removed: 0,
      failed: [{ path: identity.filePath, reason: "permission denied" }],
    });
    expect(result.sink).toEqual({ removed: 1, failed: [] });
    expect(await sink.listDayFiles()).toEqual([]);
  });

  it("repeats history unchanged after removing — history is not made reachable by removing the rest", async () => {
    const sink = new InMemoryTelemetrySink();
    const runJournalReader = new InMemoryRunJournalReader();
    const identity = new InMemoryPersonIdentityStore();
    const git = { ...noGit, listTrackedFiles: async () => ["aidd_docs/runs/committed.jsonl"] };
    const useCase = new ForgetTelemetryUseCase(sink, runJournalReader, identity, git);
    runJournalReader.runFileNames = ["committed.jsonl"];

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.history).toEqual(preview.history);
    expect(result.history).toEqual({
      certainty: "tracked",
      files: ["aidd_docs/runs/committed.jsonl"],
    });
  });

  it("proves the guarantee by mutation: removal acts on the preview's own names, never a fresh directory listing", async () => {
    const { sink, useCase } = buildUseCase();
    await sink.appendRecord(RECORD, new Date("2026-08-19T00:00:00.000Z"));
    await sink.appendRecord(RECORD, new Date("2026-08-20T00:00:00.000Z"));
    const realPreview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(realPreview.sink.dayFileNames).toEqual(["2026-08-19.jsonl", "2026-08-20.jsonl"]);

    // A person was shown only one of the two day files - the mutated value below is what
    // "shown" means for this test, standing in for a preview built before a second day
    // file appeared. Handing this to `remove()` must delete only what it names.
    const shownOnlyOneFile = {
      ...realPreview,
      sink: { ...realPreview.sink, dayFileNames: ["2026-08-19.jsonl"] },
    };

    await useCase.remove(shownOnlyOneFile);

    // The file never named in what was shown survives - a fresh `listDayFiles()` inside
    // `remove()` would have deleted it anyway, which is exactly the failure this design
    // exists to make impossible.
    expect(await sink.listDayFiles()).toEqual(["2026-08-20.jsonl"]);
    expect(sink.deletedFiles).toEqual(["2026-08-19.jsonl"]);
  });
});
