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
const BUILT_OPENCODE_SKILL = "/built/opencode/.opencode/skills/sample-plugin-demo/SKILL.md";

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

/** Installs a github-sourced marketplace plugin on `toolId`, then lowers its recorded
 * version so update sees it as stale and re-fetches. */
async function installStaleGithubPlugin(
  deps: Deps,
  registry: InMemoryMarketplaceRegistry,
  toolId: "claude" | "codex" | "copilot" | "opencode"
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
    toolIds: [toolId],
    projectRoot: PROJECT_ROOT,
    marketplace: "aidd-framework",
    interactive: false,
    pluginMetadata: PLUGIN_METADATA,
  });

  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("manifest not found");
  const plugin = manifest.getPlugins(toolId).find((p) => p.name === "sample-plugin");
  if (plugin === undefined) throw new Error("plugin not found");
  manifest.updatePlugin(toolId, plugin.withVersion("0.0.1"));
  await deps.manifestRepo.save(manifest);
}

describe("PluginUpdateUseCase — Mode A marketplace tools (claude/codex/copilot)", () => {
  it("updates a github-sourced marketplace plugin on claude without materializing any files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const registry = await makeGithubRegistry();
    await installStaleGithubPlugin(deps, registry, "claude");

    const beforeManifest = await deps.manifestRepo.load();
    const before = beforeManifest?.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(before?.files.size).toBe(0);
    expect(deps.fs.listAll().some((p) => p.includes(".claude/plugins/"))).toBe(false);

    const updated = await makeUpdateUseCase(deps, registry).execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(updated).toContain("sample-plugin");
    const manifest = await deps.manifestRepo.load();
    const plugin = manifest?.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(plugin?.version).toBe("1.0.0");
    // Mode A's whole contract: register the reference, materialize nothing. Update must
    // not write plugin files that install never wrote, nor record them in the manifest.
    expect(plugin?.files.size).toBe(0);
    expect(deps.fs.listAll().some((p) => p.includes(".claude/plugins/"))).toBe(false);
  });

  it("keeps the manifest's single entry for the plugin after update (no duplicate registration)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const registry = await makeGithubRegistry();
    await installStaleGithubPlugin(deps, registry, "claude");

    await makeUpdateUseCase(deps, registry).execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    const manifest = await deps.manifestRepo.load();
    const plugins = manifest?.getPlugins("claude").filter((p) => p.name === "sample-plugin") ?? [];
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.marketplace).toBe("aidd-framework");
    expect(plugins[0]?.source.kind).toBe("git-subdir");
  });
});

describe("PluginUpdateUseCase — flat-mode tools are unaffected (regression guard)", () => {
  it("still re-materializes opencode's flat files from the built tree on update", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "opencode");
    const registry = await makeGithubRegistry();
    await installStaleGithubPlugin(deps, registry, "opencode");
    deps.fs.setFile(BUILT_OPENCODE_SKILL, "# Demo skill v2");

    const updated = await makeUpdateUseCase(deps, registry).execute({
      toolIds: ["opencode"],
      projectRoot: PROJECT_ROOT,
    });

    expect(updated).toContain("sample-plugin");
    const manifest = await deps.manifestRepo.load();
    const plugin = manifest?.getPlugins("opencode").find((p) => p.name === "sample-plugin");
    expect(plugin?.version).toBe("1.0.0");
    expect(plugin?.files.size).toBeGreaterThan(0);
    expect(
      deps.fs.getFile(join(PROJECT_ROOT, ".opencode/skills/sample-plugin-demo/SKILL.md"))
    ).toBe("# Demo skill v2");
  });
});
