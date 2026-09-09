import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApplyPluginFilesUseCase } from "../../../../../src/contexts/framework/application/shared/apply-plugin-files-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { getToolConfig } from "../../../../../src/contexts/tools/domain/registry.js";
import { buildUnitDeps } from "../../../../helpers/ports/build-unit-deps.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";
const CACHE_DIR = join(PROJECT_ROOT, ".aidd", "plugin-cache");
const SOURCE = {
  kind: "git-subdir" as const,
  url: "https://github.com/ai-driven-dev/framework.git",
  path: "plugins/sample-plugin",
};

async function makeUseCase(): Promise<{
  useCase: ApplyPluginFilesUseCase;
  fs: Awaited<ReturnType<typeof buildUnitDeps>>["fs"];
}> {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  deps.pluginFetcher.register(SOURCE, PLUGIN_FIXTURE);
  const useCase = new ApplyPluginFilesUseCase(
    deps.fs,
    deps.hasher,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs)
  );
  return { useCase, fs: deps.fs };
}

function manifestWith(plugin: InstalledPlugin): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin("claude", plugin);
  return manifest;
}

describe("ApplyPluginFilesUseCase — without built-tree materialization wired in", () => {
  it("restores a marketplace plugin through the source transform and tracks what it wrote", async () => {
    const { useCase, fs } = await makeUseCase();
    const plugin = InstalledPlugin.fromMetadata(
      "sample-plugin",
      "1.0.0",
      SOURCE,
      false,
      "project",
      "aidd-framework"
    );
    const manifest = manifestWith(plugin);

    const restored = await useCase.execute({
      toolId: "claude",
      plugin,
      toolConfig: getToolConfig("claude"),
      projectRoot: PROJECT_ROOT,
      cacheDir: CACHE_DIR,
      manifest,
    });

    const tracked = [...manifest.getPlugins("claude")[0].files.keys()].sort();
    expect(tracked.length).toBeGreaterThan(0);
    expect(restored).toBe(tracked.length);
    expect(tracked.every((relativePath) => fs.has(join(PROJECT_ROOT, relativePath)))).toBe(true);
  });
});
