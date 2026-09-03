import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import { PluginListUseCase } from "../../../../src/application/use-cases/plugin/plugin-list-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import type { ManifestRepository } from "../../../../src/domain/ports/manifest-repository.js";

function makeManifestWithPlugin(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  const plugin = Plugin.fromJSON({
    name: "sample-plugin",
    source: { kind: "local", path: "./sample" },
    version: "1.0.0",
    strict: false,
    files: {},
  });
  manifest.addPlugin("claude", plugin);
  return manifest;
}

function makeManifestRepository(manifest: Manifest): ManifestRepository {
  return {
    path: "/test-project/.aidd/manifest.json",
    load: async () => manifest,
    save: async () => {},
    delete: async () => {},
  };
}

describe("PluginListUseCase", () => {
  describe("list plugins for installed tool", () => {
    it("returns map with installed plugins for requested tool", async () => {
      const manifest = makeManifestWithPlugin();
      const repo = makeManifestRepository(manifest);
      const useCase = new PluginListUseCase(repo);
      const result = await useCase.execute({ toolIds: ["claude"] });
      expect(result.has("claude")).toBe(true);
      const plugins = result.get("claude") ?? [];
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("sample-plugin");
      expect(plugins[0].version).toBe("1.0.0");
    });

    it("returns empty list for tool with no plugins", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "1.0.0", []);
      const repo = makeManifestRepository(manifest);
      const useCase = new PluginListUseCase(repo);
      const result = await useCase.execute({ toolIds: ["claude"] });
      expect(result.get("claude")).toHaveLength(0);
    });
  });
});
