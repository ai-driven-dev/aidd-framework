import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { RestoreAllPluginsUseCase } from "../../../../../src/contexts/framework/application/restore/restore-all-plugins-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";
const HOME = "/home/u";

// A plugin whose catalog entry resolves to a github-hosted source (git-subdir), the shape
// PluginInstallFromMarketplaceUseCase produces for any plugin catalogued in a github marketplace.
const GIT_SUBDIR_SOURCE = {
  kind: "git-subdir" as const,
  url: "https://github.com/ai-driven-dev/framework.git",
  path: "plugins/sample-plugin",
};

const PLUGIN_METADATA = { name: "sample-plugin", version: "1.0.0", strict: false };

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

async function makeGithubRegistry(): Promise<InMemoryMarketplaceRegistry> {
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

function makeRestoreUseCase(
  deps: Deps,
  registry: InMemoryMarketplaceRegistry
): RestoreAllPluginsUseCase {
  return new RestoreAllPluginsUseCase(
    deps.fs,
    deps.hasher,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    {
      ensureBuilt: fakeEnsureBuiltMarketplace(),
      marketplaceRegistry: registry,
      homedir: () => HOME,
    }
  );
}

/** Installs a github-sourced marketplace plugin on claude, so its manifest entry carries
 * both `marketplace` and a non-local `source.kind`. */
async function installGithubPlugin(
  deps: Deps,
  registry: InMemoryMarketplaceRegistry
): Promise<void> {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);

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
    toolIds: ["claude"],
    projectRoot: PROJECT_ROOT,
    marketplace: "aidd-framework",
    interactive: false,
    pluginMetadata: PLUGIN_METADATA,
  });
}

describe("RestoreAllPluginsUseCase — Mode A marketplace tools (claude/codex/copilot)", () => {
  it("cleans up files a pre-fix update/restore materialized, leaving the manifest entry empty", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const registry = await makeGithubRegistry();
    await installGithubPlugin(deps, registry);

    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");
    const plugin = manifest.getPlugins("claude").find((p) => p.name === "sample-plugin");
    if (plugin === undefined) throw new Error("plugin not found");

    // Files materialized and recorded on the manifest entry, though Mode A's own contract
    // is register-only.
    const strayFiles = new Map([
      [".claude/plugins/sample-plugin/commands/greet.md", "stray-hash-1"],
      [".claude/plugins/sample-plugin/agents/reviewer.md", "stray-hash-2"],
    ]);
    manifest.updatePlugin("claude", plugin.withFiles(strayFiles));
    for (const relativePath of strayFiles.keys()) {
      await deps.fs.writeFile(join(PROJECT_ROOT, relativePath), "stray content");
    }

    const result = await makeRestoreUseCase(deps, registry).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
      fileFilter: null,
    });

    for (const relativePath of strayFiles.keys()) {
      expect(deps.fs.getFile(join(PROJECT_ROOT, relativePath))).toBeUndefined();
    }
    const after = manifest.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(after?.files.size).toBe(0);
    expect(result.totalFiles).toBe(0);
  });

  it("leaves a file the manifest never tracked untouched, even inside the plugin's own directory", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const registry = await makeGithubRegistry();
    await installGithubPlugin(deps, registry);

    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");
    const plugin = manifest.getPlugins("claude").find((p) => p.name === "sample-plugin");
    if (plugin === undefined) throw new Error("plugin not found");

    const trackedPath = ".claude/plugins/sample-plugin/commands/greet.md";
    const untrackedPath = ".claude/plugins/sample-plugin/notes.md";
    manifest.updatePlugin("claude", plugin.withFiles(new Map([[trackedPath, "stray-hash"]])));
    await deps.fs.writeFile(join(PROJECT_ROOT, trackedPath), "stray content");
    // Not in the manifest entry — a file placed alongside the plugin's tracked ones, which
    // the cleanup must never delete, since it only iterates the manifest's own keys.
    await deps.fs.writeFile(join(PROJECT_ROOT, untrackedPath), "keep me");

    await makeRestoreUseCase(deps, registry).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
      fileFilter: null,
    });

    expect(deps.fs.getFile(join(PROJECT_ROOT, trackedPath))).toBeUndefined();
    expect(deps.fs.getFile(join(PROJECT_ROOT, untrackedPath))).toBe("keep me");
  });

  it("restores a github-sourced marketplace plugin on claude without materializing any files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const registry = await makeGithubRegistry();
    await installGithubPlugin(deps, registry);

    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");
    const before = manifest.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(before?.files.size).toBe(0);

    const result = await makeRestoreUseCase(deps, registry).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
      fileFilter: null,
    });

    // Mode A's whole contract: register the reference, materialize nothing. Restore must
    // not write plugin files that install never wrote, nor record them in the manifest.
    expect(result.totalFiles).toBe(0);
    expect(deps.fs.listAll().some((p) => p.includes(".claude/plugins/"))).toBe(false);

    const plugins = manifest.getPlugins("claude").filter((p) => p.name === "sample-plugin");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.files.size).toBe(0);
    expect(plugins[0]?.marketplace).toBe("aidd-framework");
    expect(plugins[0]?.source.kind).toBe("git-subdir");
  });
});
