import "../../../src/domain/tools/ai/cursor.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DetectPluginDriftUseCase } from "../../../src/application/use-cases/shared/detect-plugin-drift-use-case.js";
import { StatusUseCase } from "../../../src/application/use-cases/status-use-case.js";
import { FileHash } from "../../../src/domain/models/file.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { Plugin } from "../../../src/domain/models/plugin.js";
import type { FileReader } from "../../../src/domain/ports/file-reader.js";
import type { Hasher } from "../../../src/domain/ports/hasher.js";
import type { ManifestRepository } from "../../../src/domain/ports/manifest-repository.js";

const EXPECTED_HASH = "abc123abc123abc123abc123abc123ab";
const DRIFTED_HASH = "def456def456def456def456def456de";

// Cursor Mode B: file key is base-relative (no absolute prefix, relative to user plugins dir)
const PLUGIN_KEY = "aidd-context/commands/hello.md";

function makeManifest(pluginFileHash: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("cursor", "1.0.0", []);
  manifest.addPlugin(
    "cursor",
    Plugin.fromJSON({
      name: "aidd-context",
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files: { [PLUGIN_KEY]: pluginFileHash },
    })
  );
  return manifest;
}

function makeFs(fileExists: boolean, diskHash: string): FileReader {
  return {
    fileExists: async () => fileExists,
    isExecutable: async () => false,
    readFileHash: async () => new FileHash(diskHash),
    readFile: async () => "",
    listDirectory: async () => [],
    listFilesRecursive: async () => [],
  };
}

function makeManifestRepo(manifest: Manifest): ManifestRepository {
  return {
    path: "/proj/.aidd/manifest.json",
    load: async () => manifest,
    save: async () => {},
    delete: async () => {},
  };
}

const noopHasher: Hasher = {
  hash: () => new FileHash("00000000000000000000000000000000"),
};

describe("StatusUseCase — cursor plugin drift (user-scope)", () => {
  describe("when cursor plugin file has drifted (base-relative key)", () => {
    it("resolves absolute path from homedir via resolvePluginsBaseDir before checking disk", async () => {
      const manifest = makeManifest(EXPECTED_HASH);
      const checkedPaths: string[] = [];
      const fs: FileReader = {
        fileExists: async (p: string) => {
          checkedPaths.push(p);
          return true;
        },
        isExecutable: async () => false,
        readFileHash: async () => new FileHash(DRIFTED_HASH),
        readFile: async () => "",
        listDirectory: async () => [],
        listFilesRecursive: async () => [],
      };

      const useCase = new StatusUseCase(
        fs,
        makeManifestRepo(manifest),
        noopHasher,
        new DetectPluginDriftUseCase(fs)
      );
      await useCase.execute({ projectRoot: "/proj" });

      // All checked paths must be absolute (resolved from user home, not from projectRoot)
      expect(checkedPaths.some((p) => p.includes(join(".cursor", "plugins", "local")))).toBe(true);
      expect(checkedPaths.every((p) => !p.includes(join("/proj", PLUGIN_KEY)))).toBe(true);
    });

    it("returns plugin drift entry with the relative key", async () => {
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
      expect(report.pluginDrift[0].toolId).toBe("cursor");
      expect(report.pluginDrift[0].pluginName).toBe("aidd-context");
      expect(report.pluginDrift[0].driftedFiles).toContain(PLUGIN_KEY);
    });
  });

  describe("when cursor plugin file is in sync (base-relative key)", () => {
    it("returns empty pluginDrift", async () => {
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
});
