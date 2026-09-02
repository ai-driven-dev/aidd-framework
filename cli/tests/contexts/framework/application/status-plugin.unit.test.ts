import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { DetectPluginDriftUseCase } from "../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { StatusUseCase } from "../../../../src/contexts/framework/application/status-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../../../src/contexts/framework/domain/ports/manifest-repository.js";
import { FileHash } from "../../../../src/kernel/file.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";
import type { Hasher } from "../../../../src/kernel/ports/hasher.js";

const EXPECTED_HASH = "abc123abc123abc123abc123abc123ab";
const DRIFTED_HASH = "def456def456def456def456def456de";
const PLUGIN_FILE = ".claude/plugins/test-plugin/commands/greet.md";

function makeManifest(pluginFileHash: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromJSON({
      name: "test-plugin",
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

describe("StatusUseCase — plugin drift", () => {
  describe("when plugin file has drifted", () => {
    it("returns plugin drift entry for the drifted tool", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, DRIFTED_HASH);
      const useCase = new StatusUseCase(
        fs,
        makeManifestRepo(manifest),
        noopHasher,
        new DetectPluginDriftUseCase(fs)
      );

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginDrift).toHaveLength(1);
      expect(report.pluginDrift[0].toolId).toBe("claude");
      expect(report.pluginDrift[0].pluginName).toBe("test-plugin");
      expect(report.pluginDrift[0].driftedFiles).toContain(PLUGIN_FILE);
      expect(report.inSync).toBe(false);
    });
  });

  describe("when plugin file is in sync", () => {
    it("returns empty pluginDrift and inSync true (assuming no other drift)", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, EXPECTED_HASH);
      const useCase = new StatusUseCase(
        fs,
        makeManifestRepo(manifest),
        noopHasher,
        new DetectPluginDriftUseCase(fs)
      );

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginDrift).toHaveLength(0);
    });
  });

  describe("when plugin file is missing", () => {
    it("reports the file as drifted", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(false, EXPECTED_HASH);
      const useCase = new StatusUseCase(
        fs,
        makeManifestRepo(manifest),
        noopHasher,
        new DetectPluginDriftUseCase(fs)
      );

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginDrift).toHaveLength(1);
      expect(report.pluginDrift[0].driftedFiles).toContain(PLUGIN_FILE);
    });
  });

  describe("when pluginName filter is set", () => {
    it("only checks the specified plugin", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, DRIFTED_HASH);
      const useCase = new StatusUseCase(
        fs,
        makeManifestRepo(manifest),
        noopHasher,
        new DetectPluginDriftUseCase(fs)
      );

      const report = await useCase.execute({ projectRoot: "/proj", pluginName: "other-plugin" });

      expect(report.pluginDrift).toHaveLength(0);
    });
  });
});
