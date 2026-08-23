import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { PluginRemoveUseCase } from "../../../../src/application/use-cases/plugin/plugin-remove-use-case.js";
import { PluginNotFoundError } from "../../../../src/domain/errors.js";
import { PluginDistributionReaderAdapter } from "../../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

async function installPlugin(deps: Awaited<ReturnType<typeof buildUnitDeps>>): Promise<void> {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const addUseCase = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  );
  await addUseCase.execute({
    source: { kind: "local", path: PLUGIN_FIXTURE },
    toolIds: ["claude"],
    projectRoot: PROJECT_ROOT,
    interactive: false,
  });
}

describe("PluginRemoveUseCase", () => {
  describe("remove installed plugin", () => {
    it("deletes plugin files and updates manifest", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await installPlugin(deps);

      const removeUseCase = new PluginRemoveUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.nativePluginActivators
      );
      await removeUseCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(
        deps.fs.has(join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md"))
      ).toBe(false);
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      expect(plugins.some((p) => p.name === "sample-plugin")).toBe(false);
    });
  });

  describe("remove missing plugin", () => {
    it("throws PluginNotFoundError", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const removeUseCase = new PluginRemoveUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.nativePluginActivators
      );
      await expect(
        removeUseCase.execute({
          pluginName: "nonexistent-plugin",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
        })
      ).rejects.toThrow(PluginNotFoundError);
    });
  });
});
