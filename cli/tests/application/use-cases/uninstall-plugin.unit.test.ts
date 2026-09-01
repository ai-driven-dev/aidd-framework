import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { PluginAddUseCase } from "../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { UninstallUseCase } from "../../../src/application/use-cases/uninstall/uninstall-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { PluginNotFoundError } from "../../../src/kernel/errors.js";
import { buildUnitDeps, initAndInstall } from "../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../helpers/ports/fake-ensure-built-marketplace.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

describe("UninstallUseCase — plugin scope", () => {
  it("removes plugin files and unregisters from manifest when --plugin <name> given", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    // Seed plugin fixture content so PluginDistributionReaderAdapter can read it
    const { seedFromDirectory } = await import("../../helpers/ports/seed-from-directory.js");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });

    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const reader = new PluginDistributionReaderAdapter(deps.fs);
    await new PluginAddUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.pluginFetcher,
      reader,
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
    expect(deps.fs.has(pluginFile)).toBe(true);

    await new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger).execute({
      toolIds: [],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: "sample-plugin",
    });

    expect(deps.fs.has(pluginFile)).toBe(false);
    const manifest = await deps.manifestRepo.load();
    expect(manifest?.getPlugins("claude").find((p) => p.name === "sample-plugin")).toBeUndefined();
  });

  it("throws PluginNotFoundError when the plugin is not installed on any tool", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    await expect(
      new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger).execute({
        toolIds: [],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
        pluginName: "nonexistent",
      })
    ).rejects.toThrow(PluginNotFoundError);
  });
});
