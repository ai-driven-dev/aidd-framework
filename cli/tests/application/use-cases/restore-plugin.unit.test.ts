import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { RestorePluginUseCase } from "../../../src/application/use-cases/restore/restore-plugin-use-case.js";
import { PluginNotFoundError } from "../../../src/domain/errors.js";
import { PluginDistributionReaderAdapter } from "../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../helpers/ports/fake-ensure-built-marketplace.js";
import { seedFromDirectory } from "../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

describe("RestorePluginUseCase", () => {
  describe("when plugin files are corrupted", () => {
    it("re-writes plugin files to their original content", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });

      const pluginReader = new PluginDistributionReaderAdapter(deps.fs);

      await new PluginAddUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        pluginReader,
        deps.hasher,
        deps.logger,
        deps.marketplaceRegistry,
        fakeEnsureBuiltMarketplace()
      ).execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      const pluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
      await deps.fs.writeFile(pluginFile, "CORRUPTED CONTENT");

      await new RestorePluginUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        pluginReader,
        deps.hasher
      ).execute({ pluginName: "sample-plugin", projectRoot: PROJECT_ROOT });

      const restoredContent = deps.fs.getFile(pluginFile) ?? "";
      expect(restoredContent).not.toBe("CORRUPTED CONTENT");
      expect(restoredContent).toContain("Greet from sample-plugin.");
    });
  });

  describe("when plugin does not exist", () => {
    it("throws PluginNotFoundError", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const pluginReader = new PluginDistributionReaderAdapter(deps.fs);

      await expect(
        new RestorePluginUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          pluginReader,
          deps.hasher
        ).execute({ pluginName: "nonexistent-plugin", projectRoot: PROJECT_ROOT })
      ).rejects.toThrow(PluginNotFoundError);
    });
  });
});
