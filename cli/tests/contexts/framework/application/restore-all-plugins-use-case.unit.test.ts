import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import type { PluginFetcher } from "../../../../src/contexts/distribution/domain/ports/plugin-fetcher.js";
import { RestoreAllPluginsUseCase } from "../../../../src/contexts/framework/application/restore/restore-all-plugins-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { PluginDistributionReader } from "../../../../src/contexts/framework/domain/ports/plugin-distribution-reader.js";
import { PluginDistribution } from "../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../src/kernel/file.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../src/kernel/ports/file-writer.js";
import type { Hasher } from "../../../../src/kernel/ports/hasher.js";

const noopFs: FileReader & FileWriter = {
  fileExists: async () => false,
  isExecutable: async () => false,
  readFileHash: async () => new FileHash("00000000000000000000000000000000"),
  readFile: async () => "",
  listDirectory: async () => [],
  listFilesRecursive: async () => [],
  writeFile: async () => {},
  deleteFile: async () => {},
  createDirectory: async () => {},
  deleteEmptyDirectories: async () => {},
  deleteDirectory: async () => {},
  chmodExecutable: async () => {},
};

const noopHasher: Hasher = {
  hash: () => new FileHash("00000000000000000000000000000000"),
};

const stubFetcher: PluginFetcher = {
  fetch: async () => "/cache/local",
};

const emptyDistributionReader: PluginDistributionReader = {
  read: async () =>
    new PluginDistribution({
      manifest: { name: "aidd-test", version: "1.0.0" },
      format: "claude",
      files: [],
      components: { skills: [], commands: [], agents: [], rules: [], hooks: [], mcp: [] },
    }),
};

function nativePlugin(files: Record<string, string> = {}): InstalledPlugin {
  return InstalledPlugin.fromJSON({
    name: "aidd-test",
    source: { kind: "local", path: "/some/path" },
    version: "1.0.0",
    strict: false,
    files,
  });
}

describe("RestoreAllPluginsUseCase — native-activation tools", () => {
  it("names claude in nativeOnlyToolIds when its only installed plugin tracks zero files", async () => {
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    manifest.addPlugin("claude", nativePlugin({}));
    const useCase = new RestoreAllPluginsUseCase(
      noopFs,
      noopHasher,
      stubFetcher,
      emptyDistributionReader
    );

    const result = await useCase.execute({
      projectRoot: "/proj",
      manifest,
      fileFilter: null,
    });

    expect(result.nativeOnlyToolIds).toEqual(["claude"]);
    expect(result.totalFiles).toBe(0);
  });

  it("does not name a tool whose plugin files are actually tracked", async () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addPlugin("cursor", nativePlugin({ "a/one.md": "00000000000000000000000000000000" }));
    const useCase = new RestoreAllPluginsUseCase(
      noopFs,
      noopHasher,
      stubFetcher,
      emptyDistributionReader
    );

    const result = await useCase.execute({
      projectRoot: "/proj",
      manifest,
      fileFilter: null,
    });

    expect(result.nativeOnlyToolIds).toEqual([]);
  });

  it("does not name a tool that has no plugin installed at all", async () => {
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    const useCase = new RestoreAllPluginsUseCase(
      noopFs,
      noopHasher,
      stubFetcher,
      emptyDistributionReader
    );

    const result = await useCase.execute({
      projectRoot: "/proj",
      manifest,
      fileFilter: null,
    });

    expect(result.nativeOnlyToolIds).toEqual([]);
  });
});
