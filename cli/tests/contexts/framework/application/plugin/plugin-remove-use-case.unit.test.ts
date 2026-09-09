import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginRemoveUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { PluginNotFoundError } from "../../../../../src/kernel/errors.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

/** Records every path `deleteFile` is called with, so a test can prove where a plugin's
 * file actually got deleted from without inspecting private use-case state. */
class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly deletedPaths: string[] = [];

  override async deleteFile(path: string): Promise<void> {
    this.deletedPaths.push(path);
    return super.deleteFile(path);
  }
}

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

  describe("scope from the manifest wins over the tool's current profile", () => {
    it("deletes a cursor plugin's files under projectRoot when the manifest says scope: project, never under ~/.cursor/plugins/local", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      const pluginKey = "aidd-context/commands/hello.md";
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: { [pluginKey]: "abc123abc123abc123abc123abc123ab" },
          // Disagrees with cursor's own profile, which declares installScope "user".
          scope: "project",
        })
      );
      const fs = new RecordingFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const removeUseCase = new PluginRemoveUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new Map()
      );

      await removeUseCase.execute({
        pluginName: "aidd-context",
        toolIds: ["cursor"],
        projectRoot: PROJECT_ROOT,
      });

      expect(fs.deletedPaths).toContain(join(PROJECT_ROOT, pluginKey));
      expect(fs.deletedPaths.some((p) => p.includes(join(".cursor", "plugins", "local")))).toBe(
        false
      );
    });
  });
});
