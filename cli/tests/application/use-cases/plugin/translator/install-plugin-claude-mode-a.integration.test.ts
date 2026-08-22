import "../../../../../src/domain/tools/ai/claude.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/application/use-cases/marketplace/marketplace-sync-settings-use-case.js";
import { ModeAMarketplaceTranslator } from "../../../../../src/application/use-cases/plugin/translator/mode-a-marketplace-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../../src/domain/models/marketplace.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { PluginCatalogRepositoryAdapter } from "../../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE_NAME = "aidd-framework";

function buildDist(name = "aidd-context"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: "commands/hello.md", content: "# Hello" }],
    components: {
      commands: [{ relativePath: "commands/hello.md", content: "# Hello" }],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

describe("install claude plugin via Mode A (integration)", () => {
  it("splits the two keys by what each can carry, after sync", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const catalog = new PluginCatalogRepositoryAdapter(fs);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);

    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      MARKETPLACE_NAME,
      "docs"
    );
    await manifestRepo.save(manifest);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: MARKETPLACE_NAME,
        source: { kind: "local", path: "/marketplace-source" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      catalog,
      hasher,
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace()
    );
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.updatedTools).toContain("claude");
    const shared = JSON.parse(
      await fs.readFile(resolve(PROJECT_ROOT, ".claude/settings.json"))
    ) as Record<string, unknown>;
    const machineLocal = JSON.parse(
      await fs.readFile(resolve(PROJECT_ROOT, ".claude/settings.local.json"))
    ) as Record<string, unknown>;

    // The registration names the BUILT claude tree by absolute path, so it describes
    // this machine and goes to the file the CLI writes without committing or hashing it.
    expect(
      (machineLocal.extraKnownMarketplaces as Record<string, unknown>)[MARKETPLACE_NAME]
    ).toEqual({
      source: { source: "directory", path: "/built/claude" },
    });
    expect(shared.extraKnownMarketplaces).toBeUndefined();

    // Enabled plugins are named, not located, so they stay in the shared file.
    expect(
      (shared.enabledPlugins as Record<string, boolean>)[`aidd-context@${MARKETPLACE_NAME}`]
    ).toBe(true);
    expect(machineLocal.enabledPlugins).toBeUndefined();
  });

  it("does not materialize plugin files on disk for Mode A", async () => {
    const fs = new InMemoryFileAdapter();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      MARKETPLACE_NAME,
      "docs"
    );
    const pluginFiles = fs.listAll().filter((p) => p.includes(".claude/plugins/"));
    expect(pluginFiles).toEqual([]);
    const installed = manifest.getPlugins("claude").find((p) => p.name === "aidd-context");
    expect(installed?.files.size).toBe(0);
  });

  it("takes a registration left in the shared file by an older install out of it", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const catalog = new PluginCatalogRepositoryAdapter(fs);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);

    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      MARKETPLACE_NAME,
      "docs"
    );
    await manifestRepo.save(manifest);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: MARKETPLACE_NAME,
        source: { kind: "local", path: "/marketplace-source" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      catalog,
      hasher,
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace()
    );

    // What a project installed before the split looks like: the registration sitting in
    // the committed file, naming a path that belongs to whoever ran the install.
    await fs.writeFile(
      resolve(PROJECT_ROOT, ".claude/settings.json"),
      JSON.stringify({
        extraKnownMarketplaces: {
          [MARKETPLACE_NAME]: { source: { source: "directory", path: "/someone/elses/machine" } },
        },
      })
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const shared = JSON.parse(
      await fs.readFile(resolve(PROJECT_ROOT, ".claude/settings.json"))
    ) as Record<string, unknown>;
    const machineLocal = JSON.parse(
      await fs.readFile(resolve(PROJECT_ROOT, ".claude/settings.local.json"))
    ) as Record<string, unknown>;

    expect(shared.extraKnownMarketplaces).toBeUndefined();
    expect(
      (machineLocal.extraKnownMarketplaces as Record<string, unknown>)[MARKETPLACE_NAME]
    ).toEqual({
      source: { source: "directory", path: "/built/claude" },
    });
  });
});
