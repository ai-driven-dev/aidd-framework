import { resolve } from "node:path";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { UserSourceReferences } from "../../../../../src/contexts/framework/domain/ports/user-source-references.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeCurrentVersion } from "../../../../helpers/ports/fake-current-version.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE = "aidd-framework";

function marketplace(): Marketplace {
  return Marketplace.create({
    name: MARKETPLACE,
    source: { kind: "github", repo: "ai-driven-dev/framework" },
    scope: "user",
    addedAt: "2026-09-02T00:00:00Z",
  });
}

function manifestWithTool(): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  return new InMemoryManifestRepository(manifest);
}

function seededBuiltCatalog(): InMemoryFileAdapter {
  return new InMemoryFileAdapter({
    "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
      name: MARKETPLACE,
      version: "1.0.0",
      plugins: [],
    }),
  });
}

describe("MarketplaceSyncSettingsUseCase — the activation scope a caller asks for", () => {
  it("enables at project scope by default, never claude's own implicit default", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const useCase = new MarketplaceSyncSettingsUseCase(
      seededBuiltCatalog(),
      manifestWithTool(),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    // No plugin declared here, so nothing to enable — this asserts the marketplace
    // registration path ran at all (`addedMarketplaces`), the scope-threading proof
    // for enablePlugin itself lives in the next test, which does declare one.
    expect(activator.addedMarketplaces).toHaveLength(1);
  });

  it("passes the user scope down to enablePlugin when the caller asks for it", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const { InstalledPlugin } = await import(
      "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js"
    );
    manifest.addPlugin(
      "claude",
      InstalledPlugin.fromMetadata(
        "aidd-telemetry",
        "1.0.0",
        { kind: "github", repo: "ai-driven-dev/framework" },
        true,
        "project",
        MARKETPLACE
      )
    );
    const catalog = new InMemoryFileAdapter({
      "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
        name: MARKETPLACE,
        version: "1.0.0",
        plugins: [{ name: "aidd-telemetry" }],
      }),
    });
    const useCase = new MarketplaceSyncSettingsUseCase(
      catalog,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, scope: "user" });

    expect(activator.enabledPluginScopes).toEqual(["user"]);
  });

  // Both tests below share one fixture: a manifest carrying a plugin whose marketplace
  // resolves, so `syncEnabledPluginsFile` has a real entry to add to `.claude/settings.json`
  // at project scope — never `.claude/settings.local.json`, which no aidd code path
  // writes at all (`claude/profile.ts`'s own doc: "Never written by aidd; named here
  // for a diagnostic alone"). `manifestWithTool()`'s empty-files, no-plugin manifest
  // wrote nothing under either scope, which is why a mutation deleting the
  // `scope === "project"` guard around `syncTool` went unnoticed: nothing distinguished
  // "guarded" from "unguarded" when neither path ever wrote.
  async function pluginFixture(): Promise<{
    fs: InMemoryFileAdapter;
    manifestRepo: InMemoryManifestRepository;
  }> {
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const { InstalledPlugin } = await import(
      "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js"
    );
    manifest.addPlugin(
      "claude",
      InstalledPlugin.fromMetadata(
        "aidd-telemetry",
        "1.0.0",
        { kind: "github", repo: "ai-driven-dev/framework" },
        true,
        "project",
        MARKETPLACE
      )
    );
    const fs = new InMemoryFileAdapter({
      "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
        name: MARKETPLACE,
        version: "1.0.0",
        plugins: [{ name: "aidd-telemetry" }],
      }),
    });
    return { fs, manifestRepo: new InMemoryManifestRepository(manifest) };
  }

  it("writes no project file at all when the caller asks for user scope — the full project delta, not one named path", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const { fs, manifestRepo } = await pluginFixture();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, scope: "user" });

    // resolve(): a project-scope write lands at resolve(projectRoot, settingsPath) — a
    // drive letter on win32 — so checking the drive-less literal PROJECT_ROOT would stay
    // empty even if a regression started writing there, proving nothing on that platform.
    expect(fs.listUnder(resolve(PROJECT_ROOT))).toEqual([]);
  });

  it("writes .claude/settings.json for that same fixture at project scope — proof the fixture is not inert", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const { fs, manifestRepo } = await pluginFixture();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    // resolve(): the use case writes at resolve(projectRoot, settings.settingsPath), which
    // carries a drive letter on win32 — a forward-slash template literal never matches
    // that key.
    const written = await fs.readFile(resolve(PROJECT_ROOT, ".claude", "settings.json"));
    expect(written).toContain("aidd-telemetry");
  });

  it("loads and saves the manifest passed as an override, never the one it was constructed with", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const constructedRepo = manifestWithTool();
    const overrideRepo = manifestWithTool();
    const useCase = new MarketplaceSyncSettingsUseCase(
      seededBuiltCatalog(),
      constructedRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      scope: "user",
      manifestRepo: overrideRepo,
    });

    expect(result.activated).toEqual(["claude"]);
    expect(overrideRepo.getCurrent()?.getNativeRegistrations("claude")).toBeDefined();
    expect(constructedRepo.getCurrent()?.getNativeRegistrations("claude")).toBeUndefined();
  });

  it("records no shared-source reference at user scope — no project-scope manifest exists for a later clean to ever decrement it from", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const added: Array<{ version: string; projectRoot: string }> = [];
    const userSourceReferences: UserSourceReferences = {
      addReference: async (version, projectRoot) => {
        added.push({ version, projectRoot });
      },
      removeReference: async () => undefined,
      listAllReferencingProjects: async () => [],
    };
    const useCase = new MarketplaceSyncSettingsUseCase(
      seededBuiltCatalog(),
      manifestWithTool(),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      undefined,
      userSourceReferences,
      new FakeCurrentVersion()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, scope: "user" });

    expect(added).toEqual([]);
  });

  it("still records a shared-source reference at project scope, unaffected", async () => {
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace());
    const added: Array<{ version: string; projectRoot: string }> = [];
    const userSourceReferences: UserSourceReferences = {
      addReference: async (version, projectRoot) => {
        added.push({ version, projectRoot });
      },
      removeReference: async () => undefined,
      listAllReferencingProjects: async () => [],
    };
    const useCase = new MarketplaceSyncSettingsUseCase(
      seededBuiltCatalog(),
      manifestWithTool(),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      undefined,
      userSourceReferences,
      new FakeCurrentVersion()
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(added).toHaveLength(1);
  });
});
