import { describe, expect, it } from "vitest";
import { ForgetTelemetryUseCase } from "../../../../src/contexts/telemetry/application/forget-telemetry-use-case.js";
import type { VersionControl } from "../../../../src/contexts/telemetry/domain/ports/version-control.js";
import { telemetryRemovalIsEmpty } from "../../../../src/contexts/telemetry/domain/telemetry-removal.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { noGit } from "../../../contexts/framework/application/helpers.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const PROJECT_ROOT = "/repo";
const RUNS_ENTRY = "aidd_docs/runs/";

// Most tests here care about the journal/sink/identity, not about git — this stands for
// "inside a repository, nothing tracked yet", the common case, so `history` reads
// `"possible"` rather than `"none"` by default. Tests about history itself override
// `isRepository`/`listTrackedFiles`/`hasHistoryFor` explicitly.
const insideRepoNoTracking: VersionControl = { ...noGit, isRepository: async () => true };

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

function buildUseCase(git: VersionControl = insideRepoNoTracking) {
  const sink = new InMemoryTelemetrySink();
  const runJournalReader = new InMemoryRunJournalReader();
  const identity = new InMemoryPersonIdentityStore();
  const useCase = new ForgetTelemetryUseCase(sink, runJournalReader, identity, git);
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

  it("reads history at its true strength: committed reads as certain", async () => {
    const git = {
      ...insideRepoNoTracking,
      listTrackedFiles: async () => ["aidd_docs/runs/committed.jsonl"],
      hasHistoryFor: async () => true,
    };
    const { useCase } = buildUseCase(git);
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({
      certainty: "committed",
      files: ["aidd_docs/runs/committed.jsonl"],
    });
  });

  it("reads a staged-but-never-committed journal honestly — tracked, not certainly held", async () => {
    // `git add`ed but never committed: the index (`listTrackedFiles`) says tracked, but
    // history (`hasHistoryFor`) has nothing for it yet — the exact gap `git ls-files`
    // alone cannot see (finding: "history certainly holds it" was over-asserted this way).
    const git = {
      ...insideRepoNoTracking,
      listTrackedFiles: async () => ["aidd_docs/runs/staged.jsonl"],
      hasHistoryFor: async () => false,
    };
    const { useCase } = buildUseCase(git);
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({
      certainty: "staged",
      files: ["aidd_docs/runs/staged.jsonl"],
    });
  });

  it("reads an untracked journal as possible, never as an all-clear", async () => {
    const { useCase } = buildUseCase();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({ certainty: "possible" });
  });

  it("reads a non-repository as no history at all, never as a possibility", async () => {
    const git = { ...insideRepoNoTracking, isRepository: async () => false };
    const { useCase } = buildUseCase(git);
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.history).toEqual({ certainty: "none" });
  });

  it("asks listTrackedFiles and hasHistoryFor about the journal's own pathspec", async () => {
    const seenTracked: { repoRoot: string; pathspec: string }[] = [];
    const seenHistory: { repoRoot: string; pathspec: string }[] = [];
    const git: VersionControl = {
      ...insideRepoNoTracking,
      listTrackedFiles: async (repoRoot: string, pathspec: string) => {
        seenTracked.push({ repoRoot, pathspec });
        return [];
      },
      hasHistoryFor: async (repoRoot: string, pathspec: string) => {
        seenHistory.push({ repoRoot, pathspec });
        return false;
      },
    };
    const { useCase } = buildUseCase(git);
    await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(seenTracked).toEqual([{ repoRoot: PROJECT_ROOT, pathspec: RUNS_ENTRY }]);
    expect(seenHistory).toEqual([{ repoRoot: PROJECT_ROOT, pathspec: RUNS_ENTRY }]);
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
    await identity.mint();

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
    const git = {
      ...insideRepoNoTracking,
      listTrackedFiles: async () => ["aidd_docs/runs/committed.jsonl"],
      hasHistoryFor: async () => true,
    };
    const { runJournalReader, useCase } = buildUseCase(git);
    runJournalReader.runFileNames = ["committed.jsonl"];

    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    const result = await useCase.remove(preview);

    expect(result.history).toEqual(preview.history);
    expect(result.history).toEqual({
      certainty: "committed",
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

  it("proves the guarantee by mutation for the journal: removal acts on the preview's own directory, never the reader's own resolution", async () => {
    const { runJournalReader, useCase } = buildUseCase();
    runJournalReader.runFileNames = ["01ARZ3__abc.jsonl"];
    const realPreview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(realPreview.journal.path).toBe(runJournalReader.runsDir);

    // A relocated `AIDD_RUNS_DIR` between preview and remove would change what
    // `runJournalReader.runsDir` answers on the next call, but never what was already
    // shown — standing in for exactly that by handing `remove()` a preview naming a
    // different directory than the reader's own.
    const shownElsewhere = {
      ...realPreview,
      journal: { ...realPreview.journal, path: "/elsewhere/relocated-runs" },
    };

    await useCase.remove(shownElsewhere);

    expect(runJournalReader.deletedFromDirs).toEqual(["/elsewhere/relocated-runs"]);
    expect(runJournalReader.deletedFromDirs).not.toContain(runJournalReader.runsDir);
  });

  it("proves the guarantee by mutation for the identity: removal acts on the preview's own path, never the store's own resolution", async () => {
    const { identity, useCase } = buildUseCase();
    await identity.mint();
    const realPreview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(realPreview.identity.path).toBe(identity.filePath);

    // A relocated `HOME` between preview and remove would change what `identity.filePath`
    // answers on the next call, but never what was already shown.
    const shownElsewhere = {
      ...realPreview,
      identity: { ...realPreview.identity, path: "/elsewhere/relocated-identity.json" },
    };

    await useCase.remove(shownElsewhere);

    expect(identity.forgetCalledWithPath).toBe("/elsewhere/relocated-identity.json");
  });

  it("never touches an identity that was not shown in the preview — the gate on preview.identity.present", async () => {
    const { identity, useCase } = buildUseCase();
    const preview = await useCase.preview({ projectRoot: PROJECT_ROOT });
    expect(preview.identity.present).toBe(false);

    // A file appears AFTER the preview was shown and said "nothing to remove" — this must
    // never be reached, let alone deleted and counted as removed.
    identity.filePresent = true;

    const result = await useCase.remove(preview);

    expect(result.identity).toEqual({ removed: 0, failed: [] });
    expect(identity.forgetCount).toBe(0);
    expect(identity.forgetCalledWithPath).toBeNull();
  });
});
