import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginUpdateUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-update-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

async function setup(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const reader = new PluginDistributionReaderAdapter(deps.fs);
  const addUseCase = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    reader,
    deps.hasher,
    deps.logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  );
  const updateUseCase = new PluginUpdateUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    reader,
    deps.hasher
  );
  return { addUseCase, updateUseCase };
}

describe("PluginUpdateUseCase", () => {
  describe("same version", () => {
    it("does not re-write files when version is equal", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps);

      await addUseCase.execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      const pluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
      const contentBefore = deps.fs.getFile(pluginFile);

      await updateUseCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT });

      const contentAfter = deps.fs.getFile(pluginFile);
      expect(contentAfter).toBe(contentBefore);
    });
  });

  describe("newer version available", () => {
    it("re-writes files and updates manifest version", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps);

      await addUseCase.execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      // Lower the recorded version so the fixture appears newer
      const manifest = await deps.manifestRepo.load();
      if (manifest === null) throw new Error("manifest not found");
      const plugin = manifest.getPlugins("claude").find((p) => p.name === "sample-plugin");
      if (plugin === undefined) throw new Error("plugin not found");
      manifest.updatePlugin("claude", plugin.withVersion("0.0.1"));
      await deps.manifestRepo.save(manifest);

      await updateUseCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT });

      const updated = await deps.manifestRepo.load();
      const updatedPlugin = updated?.getPlugins("claude").find((p) => p.name === "sample-plugin");
      expect(updatedPlugin?.version).toBe("1.0.0");
    });
  });
});
