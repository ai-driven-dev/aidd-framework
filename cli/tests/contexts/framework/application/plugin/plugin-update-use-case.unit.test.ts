import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PluginFetchOptions } from "../../../../../src/contexts/distribution/domain/ports/plugin-fetcher.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginUpdateUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-update-use-case.js";
import type { BuiltMaterializationDeps } from "../../../../../src/contexts/framework/application/shared/apply-plugin-files-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type { PluginSource } from "../../../../../src/kernel/source.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FixturePluginFetcher } from "../../../../helpers/ports/fixture-plugin-fetcher.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const EXTRA_PLUGIN_FIXTURE = join(
  process.cwd(),
  "tests/fixtures/plugins/claude-format/extra-plugin"
);
const PROJECT_ROOT = "/test-project";
const GREET_PATH = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

class RecordingFetcher extends FixturePluginFetcher {
  readonly fetchOptions: Array<PluginFetchOptions | undefined> = [];

  override fetch(
    source: PluginSource,
    cacheDir: string,
    options?: PluginFetchOptions
  ): Promise<string> {
    this.fetchOptions.push(options);
    return super.fetch(source, cacheDir, options);
  }
}

async function setup(
  deps: Deps,
  options: { fetcher?: FixturePluginFetcher; builtDeps?: BuiltMaterializationDeps } = {}
) {
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
    options.fetcher ?? deps.pluginFetcher,
    reader,
    deps.hasher,
    options.builtDeps
  );
  return { addUseCase, updateUseCase };
}

async function addLocal(addUseCase: PluginAddUseCase, path = PLUGIN_FIXTURE): Promise<void> {
  await addUseCase.execute({
    source: { kind: "local", path },
    toolIds: ["claude"],
    projectRoot: PROJECT_ROOT,
    interactive: false,
  });
}

async function recordVersion(deps: Deps, name: string, version: string): Promise<void> {
  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("manifest not found");
  const plugin = manifest.getPlugins("claude").find((p) => p.name === name);
  if (plugin === undefined) throw new Error("plugin not found");
  manifest.updatePlugin("claude", plugin.withVersion(version));
  await deps.manifestRepo.save(manifest);
}

function installed(deps: Deps, name: string) {
  return deps.manifestRepo
    .getCurrent()
    ?.getPlugins("claude")
    .find((p) => p.name === name);
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

  describe("what it reports", () => {
    it("reports nothing when the installed version is current", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps);
      await addLocal(addUseCase);

      const updated = await updateUseCase.execute({
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(updated).toStrictEqual([]);
    });

    it("reports exactly the plugin it updated", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps);
      await addLocal(addUseCase);
      await recordVersion(deps, "sample-plugin", "0.0.1");

      const updated = await updateUseCase.execute({
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(updated).toStrictEqual(["sample-plugin"]);
    });

    it("updates only the plugins named", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps);
      await seedFromDirectory(deps.fs, EXTRA_PLUGIN_FIXTURE, { useAbsolutePaths: true });
      await addLocal(addUseCase);
      await addLocal(addUseCase, EXTRA_PLUGIN_FIXTURE);
      await recordVersion(deps, "sample-plugin", "0.0.1");
      await recordVersion(deps, "extra-plugin", "0.0.1");

      const updated = await updateUseCase.execute({
        pluginNames: ["extra-plugin"],
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(updated).toStrictEqual(["extra-plugin"]);
      expect([
        installed(deps, "sample-plugin")?.version,
        installed(deps, "extra-plugin")?.version,
      ]).toStrictEqual(["0.0.1", "1.0.0"]);
    });
  });

  describe("how it fetches", () => {
    it("fetches the plugin source with a forced refresh", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const fetcher = new RecordingFetcher();
      const { addUseCase, updateUseCase } = await setup(deps, { fetcher });
      await addLocal(addUseCase);

      await updateUseCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT });

      expect(fetcher.fetchOptions).toStrictEqual([{ forceRefresh: true }]);
    });
  });

  describe("a plugin installed from a local path", () => {
    it("re-writes its files on disk even when built-tree deps are wired", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const { addUseCase, updateUseCase } = await setup(deps, {
        builtDeps: {
          ensureBuilt: fakeEnsureBuiltMarketplace(),
          marketplaceRegistry: deps.marketplaceRegistry,
          homedir: () => "/home/u",
        },
      });
      await addLocal(addUseCase);
      await recordVersion(deps, "sample-plugin", "0.0.1");

      await updateUseCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT });

      const plugin = installed(deps, "sample-plugin");
      expect([
        plugin?.version,
        plugin?.files.has(".claude/plugins/sample-plugin/commands/greet.md"),
        deps.fs.has(GREET_PATH),
      ]).toStrictEqual(["1.0.0", true, true]);
    });
  });
});
