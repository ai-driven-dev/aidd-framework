import "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { ModeAMarketplaceTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { CapturingLogger } from "../../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

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
  it("leaves the registration to claude and keeps only what it owns", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    // Claude drives its own registration; it does not enable plugins that way.
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);

    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
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
        source: { kind: "local", path: "/marketplace-source" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const shared = JSON.parse(
      await fs.readFile(resolve(PROJECT_ROOT, ".claude/settings.json"))
    ) as Record<string, unknown>;

    // Claude registers its own marketplaces through its own command, so this CLI
    // writes no registration anywhere — not in the shared file, not beside it.
    expect(shared.extraKnownMarketplaces).toBeUndefined();
    expect(await fs.fileExists(resolve(PROJECT_ROOT, ".claude/settings.local.json"))).toBe(false);
    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);

    // Enabled plugins stay here: `claude plugin install --scope project` writes this
    // very object, so driving it would be a second way of doing the same thing.
    expect(
      (shared.enabledPlugins as Record<string, boolean>)[`aidd-context@${MARKETPLACE_NAME}`]
    ).toBe(true);
    expect(activator.enabledPlugins).toEqual([]);
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
      MARKETPLACE_NAME
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
    // Claude drives its own registration; it does not enable plugins that way.
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);

    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
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
        source: { kind: "local", path: "/marketplace-source" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
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

    expect(shared.extraKnownMarketplaces).toBeUndefined();
    expect(activator.addedMarketplaces).toContain("/built/claude");
    // Both branches wrote the shared file in this one call — the eviction, then the
    // enabled-plugins merge. Asserting the plugin landed proves the second write
    // happened, and that it did not carry the evicted key back with it.
    expect(
      (shared.enabledPlugins as Record<string, boolean>)[`aidd-context@${MARKETPLACE_NAME}`]
    ).toBe(true);
  });
});
