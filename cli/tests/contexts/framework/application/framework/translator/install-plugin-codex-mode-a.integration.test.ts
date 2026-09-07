// Codex enables plugins through its own CLI (`codex plugin add`), which writes the
// user-global `~/.codex/config.toml` and plugin cache — a project-local settings file is
// inert. This test asserts the sync drives the CodexActivator and writes NO `.codex/config.json`.
import "../../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { ModeAMarketplaceTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import type { PluginSource } from "../../../../../../src/kernel/source.js";
import { CapturingLogger } from "../../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE_NAME = "aidd-framework";

/** A readable catalog at the path the default `fakeEnsureBuiltMarketplace()` resolves
 * "codex" to, at codex's own `distributionProbes.marketplace` relative path — a real
 * build always leaves one there, so a fixture standing in for one must too, now that an
 * unreadable catalog is a hard failure rather than a silent fall back to this project's
 * own local alias (`UnreadableBuiltCatalogError`). */
async function seedBuiltCatalog(fs: InMemoryFileAdapter, name = MARKETPLACE_NAME): Promise<void> {
  await fs.writeFile(
    "/built/codex/.agents/plugins/marketplace.json",
    JSON.stringify({ name, version: "1.0.0", plugins: [] })
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

async function seedCodexPlugin(
  manifestRepo: InMemoryManifestRepository,
  registry: InMemoryMarketplaceRegistry,
  source: PluginSource = { kind: "local", path: "/marketplace-source" }
): Promise<void> {
  const manifest = Manifest.create();
  manifest.addTool("codex", "test", []);
  await new ModeAMarketplaceTranslator().addPlugin(
    buildDist(),
    "codex",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    MARKETPLACE_NAME
  );
  await manifestRepo.save(manifest);
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: MARKETPLACE_NAME,
      source,
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
}

async function seedTwoCodexPlugins(
  manifestRepo: InMemoryManifestRepository,
  registry: InMemoryMarketplaceRegistry
): Promise<void> {
  const manifest = Manifest.create();
  manifest.addTool("codex", "test", []);
  const translator = new ModeAMarketplaceTranslator();
  for (const name of ["aidd-context", "aidd-vcs"]) {
    await translator.addPlugin(
      buildDist(name),
      "codex",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      MARKETPLACE_NAME
    );
  }
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
}

describe("install codex plugin via Mode A (integration)", () => {
  it("drives the codex CLI and writes no project-local config.json", async () => {
    const fs = new InMemoryFileAdapter();
    await seedBuiltCatalog(fs);
    const hasher = new DeterministicHasher();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const activator = new FakeNativePluginActivator({ available: true });
    await seedCodexPlugin(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    // Registers the BUILT (transformed) tree, not the raw source. A fresh add
    // succeeds outright — no pre-emptive remove on a clean install.
    expect(activator.removedMarketplaces).toEqual([]);
    expect(activator.addedMarketplaces).toEqual(["/built/codex"]);
    expect(activator.upgradeCount).toBe(1);
    expect(activator.enabledPlugins).toEqual([`aidd-context@${MARKETPLACE_NAME}`]);
    expect(await fs.fileExists(resolve(PROJECT_ROOT, ".codex/config.json"))).toBe(false);
  });

  it("builds a github marketplace locally and registers the built tree", async () => {
    const fs = new InMemoryFileAdapter();
    await seedBuiltCatalog(fs);
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const activator = new FakeNativePluginActivator({ available: true });
    await seedCodexPlugin(manifestRepo, registry, {
      kind: "github",
      repo: "ai-driven-dev/framework",
    });

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.addedMarketplaces).toEqual(["/built/codex"]);
    expect(activator.enabledPlugins).toEqual([`aidd-context@${MARKETPLACE_NAME}`]);
  });

  it("enables the remaining plugins when one plugin fails (per-plugin best-effort)", async () => {
    const fs = new InMemoryFileAdapter();
    await seedBuiltCatalog(fs);
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const logger = new CapturingLogger();
    const activator = new FakeNativePluginActivator({
      available: true,
      failOnPlugins: [`aidd-context@${MARKETPLACE_NAME}`],
    });
    await seedTwoCodexPlugins(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      logger,
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toEqual([`aidd-vcs@${MARKETPLACE_NAME}`]);
    expect(logger.warnMessages.some((m) => m.includes("aidd-context@aidd-framework"))).toBe(true);
  });

  it("skips activation when the codex CLI is unavailable", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const activator = new FakeNativePluginActivator({ available: false });
    await seedCodexPlugin(manifestRepo, registry);

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.addedMarketplaces).toEqual([]);
    expect(activator.enabledPlugins).toEqual([]);
  });
});
