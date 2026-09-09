import { describe, expect, it } from "vitest";
import { DoctorMergeFilesUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-merge-files-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/project";
const MERGE_PATH = ".vscode/settings.json";
const KEY = "editor.formatOnSave";
const hasher = new DeterministicHasher();

const MISSING_FILE = {
  severity: "error",
  message: `Missing merge file: ${MERGE_PATH}`,
  fix: "Run `aidd sync --force` to reinstall tracked files.",
};
const MISSING_KEY = {
  severity: "error",
  message: `Missing key in ${MERGE_PATH} > ${KEY}`,
  fix: "Run `aidd sync --force` to restore managed keys.",
};
const MODIFIED_KEY = {
  severity: "warning",
  message: `Modified key in ${MERGE_PATH} > ${KEY}`,
  fix: "Run `aidd sync --force` to restore the original value.",
};

function manifestMerging(toolId: ToolId): Manifest {
  const manifest = Manifest.create();
  manifest.addTool(
    toolId,
    "1.0.0",
    [],
    [{ relativePath: MERGE_PATH, sectionKey: null, entries: { [KEY]: hasher.hash("true") } }]
  );
  return manifest;
}

async function issuesFor(
  onDisk: string | null,
  allowedIds: Set<string> | null = null,
  toolId: ToolId = "vscode"
) {
  const fs = new InMemoryFileAdapter(
    onDisk === null ? {} : { [`${PROJECT_ROOT}/${MERGE_PATH}`]: onDisk },
    hasher
  );
  return new DoctorMergeFilesUseCase(fs, hasher).execute({
    manifest: manifestMerging(toolId),
    projectRoot: PROJECT_ROOT,
    allowedIds,
  });
}

describe("DoctorMergeFilesUseCase", () => {
  describe("a merge file", () => {
    it("reports nothing when every managed key holds its recorded value", async () => {
      expect(await issuesFor(`{ "${KEY}": true }`)).toStrictEqual([]);
    });

    it("reports one error naming the file when it is gone from disk", async () => {
      expect(await issuesFor(null)).toStrictEqual([MISSING_FILE]);
    });

    it("reports one error naming the key when the file no longer holds it", async () => {
      expect(await issuesFor("{}")).toStrictEqual([MISSING_KEY]);
    });

    it("reports one warning naming the key when its value changed", async () => {
      expect(await issuesFor(`{ "${KEY}": false }`)).toStrictEqual([MODIFIED_KEY]);
    });
  });

  describe("narrowed to a set of tools", () => {
    it("ignores a missing merge file of a tool outside the set", async () => {
      expect(await issuesFor(null, new Set(["claude"]))).toStrictEqual([]);
    });

    it("still reports a missing merge file of a tool inside the set", async () => {
      expect(await issuesFor(null, new Set(["vscode"]))).toStrictEqual([MISSING_FILE]);
    });
  });
});
