import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { InitUseCase } from "../../../../src/contexts/framework/application/init-use-case.js";
import { DetectPluginDriftUseCase } from "../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { StatusUseCase } from "../../../../src/contexts/framework/application/status-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { machineLocalFilesOf } from "../../../../src/contexts/tools/domain/registry.js";
import { NoManifestError, ToolNotInstalledError } from "../../../../src/kernel/errors.js";
import { InstallationFile } from "../../../../src/kernel/file.js";
import { compareSemver } from "../../../../src/kernel/semver.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps } from "../../../helpers/ports/build-unit-deps.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/test-project";
const TRACKED = ".claude/rules/one.md";
const CONTENT = "one\n";
const MERGE_PATH = ".vscode/settings.json";
const KEY = "editor.formatOnSave";
const hasher = new DeterministicHasher();

function tracking(manifest: Manifest, toolId: ToolId, relativePath: string, content: string) {
  manifest.addTool(toolId, "test", [
    new InstallationFile({ relativePath, content, hash: hasher.hash(content) }),
  ]);
}

function merging(manifest: Manifest) {
  manifest.addTool(
    "vscode",
    "test",
    [],
    [{ relativePath: MERGE_PATH, sectionKey: null, entries: { [KEY]: hasher.hash("true") } }]
  );
}

function statusOver(onDisk: Record<string, string>, manifest: Manifest | null) {
  const files = Object.fromEntries(
    Object.entries(onDisk).map(([relativePath, content]) => [
      `${PROJECT_ROOT}/${relativePath}`,
      content,
    ])
  );
  const fs = new InMemoryFileAdapter(files, hasher);
  return new StatusUseCase(
    fs,
    new InMemoryManifestRepository(manifest, PROJECT_ROOT),
    hasher,
    new DetectPluginDriftUseCase(fs)
  );
}

function inSyncTool(toolId: ToolId) {
  return { toolId, version: "test", drifted: [] };
}

describe("StatusUseCase", () => {
  describe("which tools are reported", () => {
    it("fails when no manifest exists", async () => {
      await expect(statusOver({}, null).execute({ projectRoot: PROJECT_ROOT })).rejects.toThrow(
        NoManifestError
      );
    });

    it("refuses a filter naming a tool that is not installed", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);

      await expect(
        statusOver({}, manifest).execute({ projectRoot: PROJECT_ROOT, filterToolId: "cursor" })
      ).rejects.toThrow(ToolNotInstalledError);
    });

    it("reports only the filtered tool", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      manifest.addTool("vscode", "test", []);

      const report = await statusOver({}, manifest).execute({
        projectRoot: PROJECT_ROOT,
        filterToolId: "claude",
      });

      expect(report).toStrictEqual({
        tools: [inSyncTool("claude")],
        pluginDrift: [],
        inSync: true,
      });
    });

    it("reports only the tools of the requested category", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      manifest.addTool("vscode", "test", []);

      const report = await statusOver({}, manifest).execute({
        projectRoot: PROJECT_ROOT,
        category: "ide",
      });

      expect(report).toStrictEqual({
        tools: [inSyncTool("vscode")],
        pluginDrift: [],
        inSync: true,
      });
    });

    it("reports a tool whose directory is absent from disk as in sync", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);

      const report = await statusOver({}, manifest).execute({ projectRoot: PROJECT_ROOT });

      expect(report).toStrictEqual({
        tools: [inSyncTool("claude")],
        pluginDrift: [],
        inSync: true,
      });
    });
  });

  describe("tracked files", () => {
    function manifestTracking() {
      const manifest = Manifest.create();
      tracking(manifest, "claude", TRACKED, CONTENT);
      return manifest;
    }

    it("reports an untouched tracked file as in sync", async () => {
      const report = await statusOver({ [TRACKED]: CONTENT }, manifestTracking()).execute({
        projectRoot: PROJECT_ROOT,
      });

      expect(report).toStrictEqual({
        tools: [inSyncTool("claude")],
        pluginDrift: [],
        inSync: true,
      });
    });

    it("calls a tracked file whose content changed modified", async () => {
      const report = await statusOver({ [TRACKED]: "edited\n" }, manifestTracking()).execute({
        projectRoot: PROJECT_ROOT,
      });

      expect(report).toStrictEqual({
        tools: [
          {
            toolId: "claude",
            version: "test",
            drifted: [{ relativePath: TRACKED, status: "modified" }],
          },
        ],
        pluginDrift: [],
        inSync: false,
      });
    });

    it("calls a tracked file gone from disk deleted", async () => {
      const report = await statusOver({}, manifestTracking()).execute({
        projectRoot: PROJECT_ROOT,
      });

      expect(report.tools).toStrictEqual([
        {
          toolId: "claude",
          version: "test",
          drifted: [{ relativePath: TRACKED, status: "deleted" }],
        },
      ]);
    });

    it("calls a file in the tool directory the manifest does not track added", async () => {
      const report = await statusOver(
        { [TRACKED]: CONTENT, ".claude/rules/two.md": "two\n" },
        manifestTracking()
      ).execute({ projectRoot: PROJECT_ROOT });

      expect(report.tools).toStrictEqual([
        {
          toolId: "claude",
          version: "test",
          drifted: [{ relativePath: ".claude/rules/two.md", status: "added" }],
        },
      ]);
    });

    it("leaves a backup file out of the additions", async () => {
      const report = await statusOver(
        { [TRACKED]: CONTENT, ".claude/rules/one.md.backup": "old\n" },
        manifestTracking()
      ).execute({ projectRoot: PROJECT_ROOT });

      expect(report.tools).toStrictEqual([inSyncTool("claude")]);
    });
  });

  describe("merge files", () => {
    const DRIFT_PATH = `${MERGE_PATH} > ${KEY}`;

    function manifestMerging() {
      const manifest = Manifest.create();
      merging(manifest);
      return manifest;
    }

    it("reports a merge file whose managed keys match as in sync", async () => {
      const report = await statusOver(
        { [MERGE_PATH]: `{ "${KEY}": true }` },
        manifestMerging()
      ).execute({ projectRoot: PROJECT_ROOT });

      expect(report).toStrictEqual({
        tools: [inSyncTool("vscode")],
        pluginDrift: [],
        inSync: true,
      });
    });

    it("calls every managed key of a missing merge file deleted", async () => {
      const report = await statusOver({}, manifestMerging()).execute({ projectRoot: PROJECT_ROOT });

      expect(report.tools).toStrictEqual([
        {
          toolId: "vscode",
          version: "test",
          drifted: [{ relativePath: DRIFT_PATH, status: "deleted" }],
        },
      ]);
    });

    it("calls a managed key missing from the merge file deleted", async () => {
      const report = await statusOver({ [MERGE_PATH]: "{}" }, manifestMerging()).execute({
        projectRoot: PROJECT_ROOT,
      });

      expect(report.tools).toStrictEqual([
        {
          toolId: "vscode",
          version: "test",
          drifted: [{ relativePath: DRIFT_PATH, status: "deleted" }],
        },
      ]);
    });

    it("calls a managed key whose value changed modified", async () => {
      const report = await statusOver(
        { [MERGE_PATH]: `{ "${KEY}": false }` },
        manifestMerging()
      ).execute({ projectRoot: PROJECT_ROOT });

      expect(report.tools).toStrictEqual([
        {
          toolId: "vscode",
          version: "test",
          drifted: [{ relativePath: DRIFT_PATH, status: "modified" }],
        },
      ]);
    });
  });
});

describe("status", () => {
  it("reports no drift when no tools are installed", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });

    const useCase = new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    );
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.tools).toHaveLength(0);
    expect(report.inSync).toBe(true);
  });

  it("does not call a machine-local file an addition, whatever the profile declares", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });
    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest missing");
    manifest.addTool("claude", "test", []);
    await deps.manifestRepo.save(manifest);

    // Written by the CLI on purpose and never tracked. Reading the exclusion off
    // `machineLocalFilesOf` is what keeps it matching the path the profile declares.
    for (const relativePath of machineLocalFilesOf("claude")) {
      await deps.fs.writeFile(`${PROJECT_ROOT}/${relativePath}`, "{}");
    }
    expect(machineLocalFilesOf("claude").length).toBeGreaterThan(0);

    const report = await new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    ).execute({ projectRoot: PROJECT_ROOT });

    const drifted = report.tools.flatMap((tool) => tool.drifted);
    expect(drifted).toEqual([]);
    expect(report.inSync).toBe(true);
  });

  describe("compareSemver()", () => {
    it("orders lower major version as smaller", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    });

    it("orders lower minor version as smaller", () => {
      expect(compareSemver("3.1.0", "3.2.0")).toBe(-1);
    });

    it("orders higher patch version as greater", () => {
      expect(compareSemver("3.1.1", "3.1.0")).toBe(1);
    });

    it("treats identical versions as equal", () => {
      expect(compareSemver("3.1.0", "3.1.0")).toBe(0);
    });

    it("handles v-prefix", () => {
      expect(compareSemver("3.0.0", "v3.1.0")).toBe(-1);
    });
  });
});
