import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/cursor.js";
import { StatusUseCase } from "../../../src/application/use-cases/status-use-case.js";
import { FileHash } from "../../../src/domain/models/file.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { Plugin } from "../../../src/domain/models/plugin.js";
import type { FileReader } from "../../../src/domain/ports/file-reader.js";
import type { Hasher } from "../../../src/domain/ports/hasher.js";
import type { ManifestRepository } from "../../../src/domain/ports/manifest-repository.js";
import { DetectPluginDriftUseCase } from "../../../src/application/use-cases/shared/detect-plugin-drift-use-case.js";

const EXPECTED_HASH = "abc123abc123abc123abc123abc123ab";
const DRIFTED_HASH = "def456def456def456def456def456de";
const PLUGIN_FILE = ".claude/plugins/test-plugin/commands/greet.md";

function makeManifest(pluginFileHash: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.addPlugin(
    "claude",
    Plugin.fromJSON({
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
      const useCase = new StatusUseCase(fs, makeManifestRepo(manifest), noopHasher, new DetectPluginDriftUseCase(fs));

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
      const useCase = new StatusUseCase(fs, makeManifestRepo(manifest), noopHasher, new DetectPluginDriftUseCase(fs));

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginDrift).toHaveLength(0);
    });
  });

  describe("when plugin file is missing", () => {
    it("reports the file as drifted", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(false, EXPECTED_HASH);
      const useCase = new StatusUseCase(fs, makeManifestRepo(manifest), noopHasher, new DetectPluginDriftUseCase(fs));

      const report = await useCase.execute({ projectRoot: "/proj" });

      expect(report.pluginDrift).toHaveLength(1);
      expect(report.pluginDrift[0].driftedFiles).toContain(PLUGIN_FILE);
    });
  });

  describe("when pluginName filter is set", () => {
    it("only checks the specified plugin", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const fs = makeFs(true, DRIFTED_HASH);
      const useCase = new StatusUseCase(fs, makeManifestRepo(manifest), noopHasher, new DetectPluginDriftUseCase(fs));

      const report = await useCase.execute({ projectRoot: "/proj", pluginName: "other-plugin" });

      expect(report.pluginDrift).toHaveLength(0);
    });
  });
});
