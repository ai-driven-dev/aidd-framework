import "../../../../../src/contexts/tools/domain/profiles/copilot.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/application/use-cases/flows/marketplace-sync-settings-use-case.js";
import { ModeAMarketplaceTranslator } from "../../../../../src/application/use-cases/framework/translator/mode-a-marketplace-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../../src/domain/models/marketplace.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { PluginCatalogRepositoryAdapter } from "../../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE_NAME = "aidd-framework";

async function seedCopilotPlugin(
  manifestRepo: InMemoryManifestRepository,
  registry: InMemoryMarketplaceRegistry
): Promise<void> {
  const manifest = Manifest.create();
  manifest.addTool("copilot", "test", []);
  await new ModeAMarketplaceTranslator().addPlugin(
    buildDist(),
    "copilot",
    { kind: "github", repo: "ai-driven-dev/framework" },
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
      source: { kind: "github", repo: "ai-driven-dev/framework" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
}

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

describe("install copilot plugin via Mode A (integration)", () => {
  it("recommends plugins in the shared file and puts no path in it", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const catalog = new PluginCatalogRepositoryAdapter(fs);
    await seedCopilotPlugin(manifestRepo, registry);

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

    expect(result.updatedTools).toContain("copilot");
    const settingsPath = resolve(PROJECT_ROOT, ".github/copilot/settings.json");
    const settings = JSON.parse(await fs.readFile(settingsPath)) as Record<string, unknown>;

    // VS Code reads this file to recommend plugins to teammates, so it carries names.
    expect(settings.enabledPlugins).toBeDefined();

    // It must carry no marketplace registration: that names the built tree by absolute
    // path, which belongs to whoever ran the install, and copilot offers no
    // machine-local project file to hold it. Copilot learns its marketplaces from its
    // own CLI instead.
    expect(settings.extraKnownMarketplaces).toBeUndefined();
    expect(JSON.stringify(settings)).not.toContain("/built/copilot");
  });

  it("drives the copilot CLI activator and still writes the settings file", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const activator = new FakeNativePluginActivator({ available: true });
    await seedCopilotPlugin(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new PluginCatalogRepositoryAdapter(fs),
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["copilot", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    // Registers the BUILT copilot tree (not the raw github source). A fresh add
    // succeeds outright — no pre-emptive remove.
    expect(activator.removedMarketplaces).toEqual([]);
    expect(activator.addedMarketplaces).toEqual(["/built/copilot"]);
    expect(activator.enabledPlugins).toEqual([`aidd-context@${MARKETPLACE_NAME}`]);
    expect(await fs.fileExists(resolve(PROJECT_ROOT, ".github/copilot/settings.json"))).toBe(true);
  });

  it("takes the name back when whoever held it is gone", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    // The name is held, and the tool reports its source no longer resolves: nobody
    // alive is behind it, so taking it back breaks nothing.
    const activator = new FakeNativePluginActivator({
      available: true,
      conflictOnAdd: true,
      registrationState: "dead",
    });
    await seedCopilotPlugin(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new PluginCatalogRepositoryAdapter(fs),
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["copilot", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([MARKETPLACE_NAME]);
    // Forced, because a marketplace with plugins installed refuses a plain removal.
    expect(activator.forcedRemovals).toEqual([true]);
    expect(activator.addedMarketplaces).toEqual(["/built/copilot"]);
    expect(activator.enabledPlugins).toEqual([`aidd-context@${MARKETPLACE_NAME}`]);
  });

  it("leaves a name alone while it still resolves, whoever holds it", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    // Held, and the source resolves: another project is alive behind it. Taking the
    // name would break that project, and both would then steal it back on every sync.
    const activator = new FakeNativePluginActivator({
      available: true,
      conflictOnAdd: true,
      registrationState: "live",
    });
    const logger = new CapturingLogger();
    await seedCopilotPlugin(manifestRepo, registry);

    await new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new PluginCatalogRepositoryAdapter(fs),
      new DeterministicHasher(),
      logger,
      new Map([["copilot", activator]]),
      fakeEnsureBuiltMarketplace()
    ).execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([]);
    expect(logger.warnMessages.some((m) => m.includes("register marketplace"))).toBe(true);
  });

  it("says nothing about taking a name back when it cannot tell who holds it", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    // The tool offers no way to tell a dead registration from a live one, which must
    // read as "leave it alone" rather than as permission.
    const activator = new FakeNativePluginActivator({
      available: true,
      conflictOnAdd: true,
      registrationState: "unknown",
    });
    const logger = new CapturingLogger();
    await seedCopilotPlugin(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new PluginCatalogRepositoryAdapter(fs),
      new DeterministicHasher(),
      logger,
      new Map([["copilot", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([]);
    expect(logger.warnMessages.some((m) => m.includes("no longer exists"))).toBe(false);
    // The failure itself is still surfaced, not swallowed.
    expect(logger.warnMessages.some((m) => m.includes("register marketplace"))).toBe(true);
  });
});
