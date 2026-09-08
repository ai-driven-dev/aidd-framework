/**
 * Lot 9, item C: `marketplace add <name>` (and `plugin install --from <market>`) must
 * re-drive native activation for the one marketplace the command just acted on, never
 * every registered marketplace — `MarketplaceSyncSettingsOptions.marketplaceNames`
 * filters the resolved `marketplaces` inside `execute`, before the empty-registry
 * early return.
 *
 * The narrowing trap `recordNativeRegistrations` must not fall into: a narrowed run's
 * outcome only ever carries the marketplace it touched, so a plain replace of the
 * manifest's own `nativeRegistrations` would erase every other marketplace's own
 * `{alias, hostName}` and its plugin refs — the record `clean`, `doctor` and item A's
 * own `hostNameFor` all read. `recordNativeRegistrations` must instead keep every
 * existing entry outside this run's scope and replace only what this run touched,
 * merging `pluginRefs` by the `@<hostName>` suffix the touched marketplaces own.
 */
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import type { EnsureBuiltMarketplace } from "../../../../../src/contexts/framework/application/shared/ensure-built-marketplace-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";

function marketplace(name: string): Marketplace {
  return Marketplace.create({
    name,
    source: { kind: "github", repo: `ai-driven-dev/${name}` },
    scope: "project",
    addedAt: "2026-09-02T00:00:00Z",
  });
}

/** Keyed by marketplace name rather than tool — the default fake keys by tool alone,
 * which would resolve two marketplaces to the same built tree and the same catalog. */
function ensureBuiltPerMarketplace(): EnsureBuiltMarketplace {
  return {
    execute: async (options) => ({
      builtDir: `/built/${options.marketplace.name}`,
      version: "test",
      rebuilt: true,
    }),
  };
}

function seededCatalogs(): InMemoryFileAdapter {
  return new InMemoryFileAdapter({
    "/built/market-a/.claude-plugin/marketplace.json": JSON.stringify({
      name: "market-a",
      version: "1.0.0",
      plugins: [{ name: "plugin-a" }],
    }),
    "/built/market-b/.claude-plugin/marketplace.json": JSON.stringify({
      name: "market-b",
      version: "1.0.0",
      plugins: [{ name: "plugin-b" }],
    }),
  });
}

function manifestWithTwoPlugins(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromMetadata(
      "plugin-a",
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/A" },
      true,
      "project",
      "market-a"
    )
  );
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromMetadata(
      "plugin-b",
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/B" },
      true,
      "project",
      "market-b"
    )
  );
  return manifest;
}

function build(activator: FakeNativePluginActivator) {
  const registry = new InMemoryMarketplaceRegistry();
  const fs = seededCatalogs();
  const manifest = manifestWithTwoPlugins();
  const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
  const hasher = new DeterministicHasher();
  return {
    registry,
    fs,
    manifest,
    manifestRepo,
    useCase: new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      ensureBuiltPerMarketplace()
    ),
  };
}

describe("marketplaceNames narrows a sync run to the marketplaces named", () => {
  it("registers and enables only the named marketplace's own plugin", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry } = build(activator);
    await registry.save(PROJECT_ROOT, marketplace("market-a"));
    await registry.save(PROJECT_ROOT, marketplace("market-b"));

    await useCase.execute({ projectRoot: PROJECT_ROOT, marketplaceNames: ["market-b"] });

    expect(activator.addedMarketplaces).toEqual(["/built/market-b"]);
    expect(activator.enabledPlugins).toEqual(["plugin-b@market-b"]);
  });

  it("keeps the untouched marketplace's own nativeRegistrations entry, never replacing it", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry, manifestRepo } = build(activator);
    await registry.save(PROJECT_ROOT, marketplace("market-a"));
    await registry.save(PROJECT_ROOT, marketplace("market-b"));
    // A first full run seeds both marketplaces' own registrations.
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    await useCase.execute({ projectRoot: PROJECT_ROOT, marketplaceNames: ["market-b"] });

    const reloaded = await manifestRepo.load();
    const registrations = reloaded?.getNativeRegistrations("claude");
    expect(registrations?.marketplaces).toEqual(
      expect.arrayContaining([{ alias: "market-a", hostName: "market-a" }])
    );
    expect(registrations?.pluginRefs).toEqual(expect.arrayContaining(["plugin-a@market-a"]));
  });

  it("drops a stale ref for the touched marketplace by its hostName suffix, keeping the untouched marketplace's own refs", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry, manifest, manifestRepo } = build(activator);
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [
        { alias: "market-a", hostName: "market-a" },
        { alias: "market-b", hostName: "market-b" },
      ],
      pluginRefs: ["plugin-a@market-a", "plugin-b-old@market-b"],
    });
    await manifestRepo.save(manifest);
    await registry.save(PROJECT_ROOT, marketplace("market-a"));
    await registry.save(PROJECT_ROOT, marketplace("market-b"));

    await useCase.execute({ projectRoot: PROJECT_ROOT, marketplaceNames: ["market-b"] });

    const reloaded = await manifestRepo.load();
    const registrations = reloaded?.getNativeRegistrations("claude");
    expect(registrations?.pluginRefs).toContain("plugin-a@market-a");
    expect(registrations?.pluginRefs).toContain("plugin-b@market-b");
    expect(registrations?.pluginRefs).not.toContain("plugin-b-old@market-b");
  });

  it("returns the empty result and calls no activator at all for a name matching no registered marketplace", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry } = build(activator);
    await registry.save(PROJECT_ROOT, marketplace("market-a"));
    await registry.save(PROJECT_ROOT, marketplace("market-b"));

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, marketplaceNames: ["nope"] });

    expect(result).toEqual({ activated: [], binaryMissing: [], warnings: [], errors: [] });
    expect(activator.addedMarketplaces).toEqual([]);
    expect(activator.enabledPlugins).toEqual([]);
  });

  it("activates every registered marketplace when marketplaceNames is not given at all", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry } = build(activator);
    await registry.save(PROJECT_ROOT, marketplace("market-a"));
    await registry.save(PROJECT_ROOT, marketplace("market-b"));

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.addedMarketplaces.sort()).toEqual(["/built/market-a", "/built/market-b"]);
    expect(activator.enabledPlugins.sort()).toEqual(["plugin-a@market-a", "plugin-b@market-b"]);
  });
});
