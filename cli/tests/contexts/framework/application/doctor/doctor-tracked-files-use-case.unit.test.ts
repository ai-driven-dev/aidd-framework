import { describe, expect, it } from "vitest";
import { DoctorTrackedFilesUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-tracked-files-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstallationFile } from "../../../../../src/kernel/file.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/project";
const FILE = ".claude/rules/one.md";
const CONTENT = "one\n";
const hasher = new DeterministicHasher();

const MISSING = {
  severity: "error",
  message: `Missing tracked file: ${FILE}`,
  fix: "Restore the file or run `aidd sync` to reinstall tracked files.",
};
const MODIFIED = {
  severity: "warning",
  message: `Modified tracked file: ${FILE}`,
  fix: "Run `aidd sync --force` to revert to the framework version.",
};

function manifestTracking(toolId: ToolId): Manifest {
  const manifest = Manifest.create();
  manifest.addTool(toolId, "1.0.0", [
    new InstallationFile({ relativePath: FILE, content: CONTENT, hash: hasher.hash(CONTENT) }),
  ]);
  return manifest;
}

async function issuesFor(
  onDisk: string | null,
  allowedIds: Set<string> | null = null,
  toolId: ToolId = "claude"
) {
  const fs = new InMemoryFileAdapter(
    onDisk === null ? {} : { [`${PROJECT_ROOT}/${FILE}`]: onDisk },
    hasher
  );
  return new DoctorTrackedFilesUseCase(fs).execute({
    manifest: manifestTracking(toolId),
    projectRoot: PROJECT_ROOT,
    allowedIds,
  });
}

describe("DoctorTrackedFilesUseCase", () => {
  describe("a tracked file", () => {
    it("reports nothing when the disk matches the manifest", async () => {
      expect(await issuesFor(CONTENT)).toStrictEqual([]);
    });

    it("reports one error naming the file when it is gone from disk", async () => {
      expect(await issuesFor(null)).toStrictEqual([MISSING]);
    });

    it("reports one warning naming the file when its content changed", async () => {
      expect(await issuesFor("edited\n")).toStrictEqual([MODIFIED]);
    });
  });

  describe("narrowed to a set of tools", () => {
    it("ignores a missing file of a tool outside the set", async () => {
      expect(await issuesFor(null, new Set(["cursor"]))).toStrictEqual([]);
    });

    it("ignores a modified file of a tool outside the set", async () => {
      expect(await issuesFor("edited\n", new Set(["cursor"]))).toStrictEqual([]);
    });

    it("still reports a missing file of a tool inside the set", async () => {
      expect(await issuesFor(null, new Set(["claude"]))).toStrictEqual([MISSING]);
    });

    it("still reports a modified file of a tool inside the set", async () => {
      expect(await issuesFor("edited\n", new Set(["claude"]))).toStrictEqual([MODIFIED]);
    });
  });

  describe("collectTrackedFiles", () => {
    it("pairs every tracked file with the tool that owns it", () => {
      const collected = new DoctorTrackedFilesUseCase(
        new InMemoryFileAdapter()
      ).collectTrackedFiles(manifestTracking("claude"), null);

      expect(collected.map((f) => [f.relativePath, f.toolId])).toStrictEqual([[FILE, "claude"]]);
    });
  });
});
