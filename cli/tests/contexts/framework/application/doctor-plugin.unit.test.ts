import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { DoctorLayoutUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-layout-use-case.js";
import { DoctorMergeFilesUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-merge-files-use-case.js";
import { DoctorPluginUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-plugin-use-case.js";
import { DoctorReferencesUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-references-use-case.js";
import { DoctorRegistrationUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { DoctorTrackedFilesUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-tracked-files-use-case.js";
import { DoctorUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-use-case.js";
import { DetectPluginDriftUseCase } from "../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../../../src/contexts/framework/domain/ports/manifest-repository.js";
import { FileHash } from "../../../../src/kernel/file.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";
import type { Hasher } from "../../../../src/kernel/ports/hasher.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const EXPECTED_HASH = "abc123abc123abc123abc123abc123ab";
const DRIFTED_HASH = "def456def456def456def456def456de";
const PLUGIN_FILE = ".claude/plugins/my-plugin/commands/cmd.md";

function makeManifest(pluginFileHash: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromJSON({
      name: "my-plugin",
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files: { [PLUGIN_FILE]: pluginFileHash },
    })
  );
  return manifest;
}

function makeFs(fileExists: boolean, diskHash: string): FileReader {
  return {
    fileExists: async () => fileExists,
    readFileHash: async () => new FileHash(diskHash),
    readFile: async () => "",
    writeFile: async () => {},
    deleteFile: async () => {},
    listDirectory: async () => [],
    deleteEmptyDirectories: async () => {},
    copyFile: async () => {},
  } as unknown as FileReader;
}

function makeManifestRepo(manifest: Manifest): ManifestRepository {
  return { load: async () => manifest, save: async () => {}, delete: async () => {} };
}

const noopHasher: Hasher = {
  hash: () => new FileHash("00000000000000000000000000000000"),
};

function makeDoctorUseCase(fs: FileReader, manifest: Manifest): DoctorUseCase {
  return new DoctorUseCase(
    makeManifestRepo(manifest),
    new DoctorTrackedFilesUseCase(fs),
    new DoctorMergeFilesUseCase(fs, noopHasher),
    new DoctorPluginUseCase(new DetectPluginDriftUseCase(fs)),
    new DoctorReferencesUseCase(fs),
    new DoctorLayoutUseCase(fs),
    new DoctorRegistrationUseCase(fs, new InMemoryMarketplaceRegistry())
  );
}

describe("DoctorUseCase — plugin integrity", () => {
  describe("when plugin file is missing", () => {
    it("reports a missing plugin issue", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(false, EXPECTED_HASH);
      const useCase = makeDoctorUseCase(fs, manifest);

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginIssues).toHaveLength(1);
      expect(report.pluginIssues[0].issue).toBe("missing");
      expect(report.pluginIssues[0].pluginName).toBe("my-plugin");
      expect(report.pluginIssues[0].filePath).toBe(PLUGIN_FILE);
      expect(report.healthy).toBe(false);
    });
  });

  describe("when plugin file has hash mismatch", () => {
    it("reports a hash-mismatch plugin issue", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, DRIFTED_HASH);
      const useCase = makeDoctorUseCase(fs, manifest);

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginIssues).toHaveLength(1);
      expect(report.pluginIssues[0].issue).toBe("hash-mismatch");
      expect(report.pluginIssues[0].toolId).toBe("claude");
    });
  });

  describe("when all plugin files are present and correct", () => {
    it("returns empty pluginIssues", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, EXPECTED_HASH);
      const useCase = makeDoctorUseCase(fs, manifest);

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginIssues).toHaveLength(0);
    });
  });

  describe("when pluginName filter is set", () => {
    it("only checks the specified plugin", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(false, EXPECTED_HASH);
      const useCase = makeDoctorUseCase(fs, manifest);

      const report = await useCase.execute({ projectRoot: "/proj", pluginName: "other-plugin" });

      expect(report.pluginIssues).toHaveLength(0);
    });
  });

  describe("when plugin is installed under user-scope (Cursor Mode B)", () => {
    it("checks files under the resolved user-scope base dir, not projectRoot", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      const cursorBaseDir = join(homedir(), ".cursor", "plugins", "local");
      const userScopeRelPath = "aidd-context/skills/06-discovery/SKILL.md";
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: { [userScopeRelPath]: EXPECTED_HASH },
        })
      );
      const checkedPaths: string[] = [];
      const fs = {
        fileExists: async (p: string) => {
          checkedPaths.push(p);
          return true;
        },
        readFileHash: async () => new FileHash(EXPECTED_HASH),
        readFile: async () => "",
        writeFile: async () => {},
        deleteFile: async () => {},
        listDirectory: async () => [],
        listFilesRecursive: async () => [],
        deleteEmptyDirectories: async () => {},
        copyFile: async () => {},
      } as unknown as FileReader;
      const pluginUseCase = new DoctorPluginUseCase(new DetectPluginDriftUseCase(fs));

      await pluginUseCase.execute({
        manifest,
        projectRoot: "/proj",
        allowedIds: null,
      });

      const expectedAbs = join(cursorBaseDir, userScopeRelPath);
      expect(checkedPaths).toContain(expectedAbs);
      expect(checkedPaths.every((p) => !p.startsWith("/proj/aidd-context"))).toBe(true);
    });
  });
});
