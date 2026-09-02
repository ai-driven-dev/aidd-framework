import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginUpdateUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-update-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";
const HOME = "/home/u";
/** Where cursor's PluginsCapability resolves user-scope plugin writes to. */
const USER_PLUGINS_DIR = join(HOME, ".cursor/plugins/local");
const BUILT_SKILL = "/built/cursor/plugins/sample-plugin/skills/demo/SKILL.md";

const GIT_SUBDIR_SOURCE = {
  kind: "git-subdir" as const,
  url: "https://github.com/ai-driven-dev/framework.git",
  path: "plugins/sample-plugin",
};

const PLUGIN_METADATA = { name: "sample-plugin", version: "1.0.0", strict: false };

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

async function makeRegistry(): Promise<InMemoryMarketplaceRegistry> {
  const registry = new InMemoryMarketplaceRegistry();
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: "aidd-framework",
      source: { kind: "github", repo: "ai-driven-dev/framework" },
      scope: "project",
      addedAt: "2026-05-01T00:00:00.000Z",
    })
  );
  return registry;
}

function makeUpdateUseCase(deps: Deps, registry: InMemoryMarketplaceRegistry): PluginUpdateUseCase {
  return new PluginUpdateUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    {
      ensureBuilt: fakeEnsureBuiltMarketplace(),
      marketplaceRegistry: registry,
      homedir: () => HOME,
    }
  );
}

/** Installs a cursor marketplace plugin, then lowers its recorded version so update re-materializes. */
async function installStalePlugin(
  deps: Deps,
  registry: InMemoryMarketplaceRegistry
): Promise<void> {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
  deps.fs.setFile(BUILT_SKILL, "# Demo skill");

  await new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    registry,
    fakeEnsureBuiltMarketplace()
  ).execute({
    source: GIT_SUBDIR_SOURCE,
    toolIds: ["cursor"],
    projectRoot: PROJECT_ROOT,
    marketplace: "aidd-framework",
    interactive: false,
    pluginMetadata: PLUGIN_METADATA,
  });

  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("manifest not found");
  const plugin = manifest.getPlugins("cursor").find((p) => p.name === "sample-plugin");
  if (plugin === undefined) throw new Error("plugin not found");
  manifest.updatePlugin("cursor", plugin.withVersion("0.0.1"));
  await deps.manifestRepo.save(manifest);
}

describe("PluginUpdateUseCase — built-tree materialization", () => {
  it("re-materializes from the built tree for a marketplace plugin", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "cursor");
    const registry = await makeRegistry();
    await installStalePlugin(deps, registry);

    deps.fs.setFile(BUILT_SKILL, "# Demo skill v2");

    const updated = await makeUpdateUseCase(deps, registry).execute({
      toolIds: ["cursor"],
      projectRoot: PROJECT_ROOT,
    });

    expect(updated).toContain("sample-plugin");
    const manifest = await deps.manifestRepo.load();
    const plugin = manifest?.getPlugins("cursor").find((p) => p.name === "sample-plugin");
    expect(plugin?.version).toBe("1.0.0");
    expect(plugin?.files.size).toBeGreaterThan(0);
  });

  it("writes the updated plugin under the user-scope base dir, not the project root", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "cursor");
    const registry = await makeRegistry();
    await installStalePlugin(deps, registry);

    await makeUpdateUseCase(deps, registry).execute({
      toolIds: ["cursor"],
      projectRoot: PROJECT_ROOT,
    });

    const manifest = await deps.manifestRepo.load();
    const plugin = manifest?.getPlugins("cursor").find((p) => p.name === "sample-plugin");
    const written = [...(plugin?.files.keys() ?? [])];
    expect(written.length).toBeGreaterThan(0);
    for (const relativePath of written) {
      expect(deps.fs.getFile(join(USER_PLUGINS_DIR, relativePath))).toBeDefined();
      expect(deps.fs.getFile(join(PROJECT_ROOT, relativePath))).toBeUndefined();
    }
  });
});
