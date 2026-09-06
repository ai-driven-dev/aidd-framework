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

function makeManifestRepo(manifest: Manifest): ManifestRepository {
  return {
    path: "/proj/.aidd/manifest.json",
    load: async () => manifest,
    save: async () => {},
    delete: async () => {},
  };
}

const noopFs: FileReader = {
  fileExists: async () => true,
  isExecutable: async () => false,
  readFileHash: async () => new FileHash("00000000000000000000000000000000"),
  readFile: async () => "",
  listDirectory: async () => [],
  listFilesRecursive: async () => [],
};

const noopHasher: Hasher = {
  hash: () => new FileHash("00000000000000000000000000000000"),
};

/**
 * Claude only loads a plugin once its own CLI has registered it, so this CLI tracks no
 * files for it — `plugin.files` is empty by construction, never a bug in a fixture. A
 * real install measured this: `aidd setup --ai claude --plugins recommended` writes
 * `"files": {}` into the manifest for the claude entry.
 */
function claudeManifestWithNativePlugin(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromJSON({
      name: "aidd-test",
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files: {},
    })
  );
  return manifest;
}

describe("StatusUseCase — native-activation tools carry nothing this CLI can verify", () => {
  it("names claude in pluginNativeOnly rather than leaving it silently in sync", async () => {
    const manifest = claudeManifestWithNativePlugin();
    const useCase = new StatusUseCase(
      noopFs,
      makeManifestRepo(manifest),
      noopHasher,
      new DetectPluginDriftUseCase(noopFs)
    );

    const report = await useCase.execute({ projectRoot: "/proj" });

    expect(report.pluginNativeOnly).toEqual([{ toolId: "claude", binary: "claude" }]);
    // Never counted as drift: a tool nothing checked is not the same fact as a tool
    // that failed a check, and `inSync` must keep meaning the latter.
    expect(report.pluginDrift).toHaveLength(0);
    expect(report.inSync).toBe(true);
  });

  it("names nothing for a tool whose plugin files are actually tracked", async () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name: "aidd-test",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { "aidd-test/a.md": "00000000000000000000000000000000" },
      })
    );
    const useCase = new StatusUseCase(
      noopFs,
      makeManifestRepo(manifest),
      noopHasher,
      new DetectPluginDriftUseCase(noopFs)
    );

    const report = await useCase.execute({ projectRoot: "/proj" });

    expect(report.pluginNativeOnly).toEqual([]);
  });
});
