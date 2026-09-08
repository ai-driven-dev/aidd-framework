import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MarketplaceRegisterFrameworkUseCase } from "../../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { DoctorRegistrationUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { UserSourceReferences } from "../../../../../src/contexts/framework/domain/ports/user-source-references.js";
import type { NativePluginActivator } from "../../../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import {
  BUILT_CACHE_SUBDIR,
  builtMarketplaceDir,
  userBuiltMarketplaceDir,
} from "../../../../../src/kernel/paths.js";
import type { VersionReader } from "../../../../../src/kernel/ports/version-reader.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeHostMarketplaceRegistryReader } from "../../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/project";
const CLAUDE_BUILT_DIR = "/shared/built/claude";
const CODEX_BUILT_DIR = "/shared/built/codex";
const CATALOG_RELATIVE = ".claude-plugin/marketplace.json";

function fakeVersion(value: string): VersionReader {
  return { get: () => value };
}

function catalogFixture(builtDir: string): Record<string, string> {
  return {
    [`${builtDir}/${CATALOG_RELATIVE}`]: JSON.stringify({
      name: FRAMEWORK_MARKETPLACE_NAME,
      version: "1.0.0",
      plugins: [],
    }),
  };
}

function projectScopeEntry(source: Marketplace["source"]): Marketplace {
  return Marketplace.create({
    name: FRAMEWORK_MARKETPLACE_NAME,
    source,
    scope: "project",
    addedAt: "2026-01-01T00:00:00Z",
  });
}

function noSourceReferences(
  added: Array<{ version: string; projectRoot: string }>
): UserSourceReferences {
  return {
    addReference: async (version, projectRoot) => {
      added.push({ version, projectRoot });
    },
    removeReference: async () => undefined,
    listAllReferencingProjects: async () => [],
  };
}

describe("MarketplaceSyncSettingsUseCase — sync migrates a project installed before the shared source", () => {
  it("preserves the existing entry's own source when migrating it from project to user scope, never falling back to the local default", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      projectScopeEntry({ kind: "github", repo: "ai-driven-dev/framework", ref: "v1" })
    );
    const manifest = Manifest.create();
    const useCase = new MarketplaceSyncSettingsUseCase(
      new InMemoryFileAdapter(catalogFixture(CLAUDE_BUILT_DIR)),
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    const entries = await registry.list(PROJECT_ROOT);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.scope).toBe("user");
    expect(entries[0]?.source).toEqual({
      kind: "github",
      repo: "ai-driven-dev/framework",
      ref: "v1",
    });
  });

  it("registers the framework at user scope even when the project-scope entry is the only one present — not only when the registry is empty", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, projectScopeEntry({ kind: "local", path: "/some/path" }));
    const manifest = Manifest.create();
    const useCase = new MarketplaceSyncSettingsUseCase(
      new InMemoryFileAdapter(catalogFixture(CLAUDE_BUILT_DIR)),
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    const entries = await registry.list(PROJECT_ROOT);
    expect(entries).toEqual([expect.objectContaining({ scope: "user" })]);
  });
});

describe("MarketplaceSyncSettingsUseCase — codex and copilot refuse the same name from a different source", () => {
  function frameworkAtUserScope(): Marketplace {
    return Marketplace.create({
      name: FRAMEWORK_MARKETPLACE_NAME,
      source: { kind: "local", path: "." },
      scope: "user",
      addedAt: "2026-01-01T00:00:00Z",
    });
  }

  it("reclaims a codex registration that still names the pre-migration path, by removing then re-adding the shared source", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, frameworkAtUserScope());
    const manifest = Manifest.create();
    manifest.addTool("codex", "test", []);
    const activator = new FakeNativePluginActivator({
      available: true,
      enablesPlugins: false,
      conflictOnAdd: true,
    });
    const fs = new InMemoryFileAdapter({
      [`${CODEX_BUILT_DIR}/.agents/plugins/marketplace.json`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace(() => CODEX_BUILT_DIR)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([FRAMEWORK_MARKETPLACE_NAME]);
    expect(activator.addedMarketplaces).toEqual([CODEX_BUILT_DIR]);
  });

  it("never reclaims an arbitrary, non-reserved marketplace name this way — only the framework's own", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "someones-plugins",
        source: { kind: "local", path: "." },
        scope: "user",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("codex", "test", []);
    const activator = new FakeNativePluginActivator({
      available: true,
      enablesPlugins: false,
      conflictOnAdd: true,
    });
    const builtDir = "/shared/built/other/codex";
    const fs = new InMemoryFileAdapter({
      [`${builtDir}/.agents/plugins/marketplace.json`]: JSON.stringify({
        name: "someones-plugins",
        version: "1.0.0",
        plugins: [],
      }),
    });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["codex", activator]]),
      fakeEnsureBuiltMarketplace(() => builtDir)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([]);
    expect(activator.addedMarketplaces).toEqual([]);
  });

  // `isUnguardedFrameworkMarketplace`'s third clause excludes a tool whose profile
  // declares `NativeActivation.marketplaceRegistry` — today only claude — from this
  // reclaim door: a registry conflict for that tool must surface as a reported error,
  // never be silently overwritten by `remove` then `add`. Deleting that clause leaves
  // every other test in this file green, since none of them drives claude through a
  // conflicting `addMarketplace` at all.
  it("never reclaims the reserved framework name for a tool that declares its own marketplace registry — claude reports the conflict instead", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, frameworkAtUserScope());
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({
      available: true,
      enablesPlugins: false,
      conflictOnAdd: true,
    });
    const fs = new InMemoryFileAdapter({
      [`${CLAUDE_BUILT_DIR}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR)
      // No `hostMarketplaceRegistries` reader for claude here: `guardAgainstConflict`
      // returns "proceed" without ever reading a registry, so the only way this run
      // can reach a conflict at all is the same `addMarketplace` throw every other
      // test in this file drives — proving the exclusion is decided in
      // `reclaimOrReport`, never upstream of it.
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([]);
    expect(activator.addedMarketplaces).toEqual([]);
    expect(result.warnings.some((w) => w.includes("skipped:"))).toBe(true);
  });
});

describe("MarketplaceSyncSettingsUseCase — the host still tracks another, unmigrated project's cache", () => {
  const USER_CACHE_ROOT = "/user-cache";
  const CURRENT_VERSION = "2.0.0";

  function sharedBuiltDir(): string {
    return userBuiltMarketplaceDir(
      USER_CACHE_ROOT,
      CURRENT_VERSION,
      FRAMEWORK_MARKETPLACE_NAME,
      "claude"
    );
  }

  it("registers the shared source without breaking, and records a reference for both this project and the one the host used to point at", async () => {
    const foreignProjectCache = builtMarketplaceDir(
      "/other-project",
      FRAMEWORK_MARKETPLACE_NAME,
      "claude"
    );
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "user",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const fs = new InMemoryFileAdapter({
      [`${sharedBuiltDir()}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: CURRENT_VERSION,
        plugins: [],
      }),
      // The foreign project's own directory still exists — a host registry pointing
      // there implies it does — so its own claim on the shared source is worth
      // recording.
      [`${foreignProjectCache}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: "/home/.claude/plugins/known_marketplaces.json",
      entries: new Map([[FRAMEWORK_MARKETPLACE_NAME, foreignProjectCache]]),
    });
    const added: Array<{ version: string; projectRoot: string }> = [];
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => sharedBuiltDir()),
      new Map([["claude", hostReader]]),
      () => USER_CACHE_ROOT,
      undefined,
      noSourceReferences(added),
      fakeVersion(CURRENT_VERSION)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    // The host is repointed onto the shared build without ever throwing — same
    // catalog, foreign path, which `guardAgainstConflict` already treats as an
    // ordinary migration, not a conflict.
    expect(activator.addedMarketplaces).toEqual([sharedBuiltDir()]);
    const roots = added.map((a) => a.projectRoot);
    expect(roots).toContain(PROJECT_ROOT);
    expect(roots).toContain("/other-project");
  });

  it("never records a reference for the foreign project's own root once that root no longer exists", async () => {
    const foreignProjectCache = builtMarketplaceDir(
      "/gone-project",
      FRAMEWORK_MARKETPLACE_NAME,
      "claude"
    );
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "user",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    // Nothing is seeded under `foreignProjectCache` at all — the directory a real
    // `rm -rf` would have removed after the fact.
    const fs = new InMemoryFileAdapter({
      [`${sharedBuiltDir()}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: CURRENT_VERSION,
        plugins: [],
      }),
    });
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: "/home/.claude/plugins/known_marketplaces.json",
      entries: new Map([[FRAMEWORK_MARKETPLACE_NAME, foreignProjectCache]]),
    });
    const added: Array<{ version: string; projectRoot: string }> = [];
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => sharedBuiltDir()),
      new Map([["claude", hostReader]]),
      () => USER_CACHE_ROOT,
      undefined,
      noSourceReferences(added),
      fakeVersion(CURRENT_VERSION)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.addedMarketplaces).toEqual([sharedBuiltDir()]);
    const roots = added.map((a) => a.projectRoot);
    expect(roots).toContain(PROJECT_ROOT);
    expect(roots).not.toContain("/gone-project");
  });
});

describe("MarketplaceSyncSettingsUseCase — purging this project's own pre-migration cache", () => {
  const OLD_CACHE_DIR = join(PROJECT_ROOT, BUILT_CACHE_SUBDIR, FRAMEWORK_MARKETPLACE_NAME);
  const OLD_CACHE_FILE = join(OLD_CACHE_DIR, "claude", "agents", "some-agent.md");

  function projectWithMigratableEntry(): InMemoryMarketplaceRegistry {
    const registry = new InMemoryMarketplaceRegistry();
    registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    return registry;
  }

  it("deletes the project's own stale built tree once the run completes without error", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const fs = new InMemoryFileAdapter({
      [OLD_CACHE_FILE]: "stale content",
      [`${CLAUDE_BUILT_DIR}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    expect(fs.has(OLD_CACHE_FILE)).toBe(false);
  });

  // S1: a tool whose binary is off `PATH` never reaches `activateTool` at all — its
  // own host registration, if it still names this project's pre-migration cache, gets
  // no chance to move off it this run. Purging the cache regardless would leave that
  // dangling registration with nothing left to resolve.
  it("keeps the stale built tree in place, and warns, when a requested tool's binary is off PATH", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: false });
    const fs = new InMemoryFileAdapter({ [OLD_CACHE_FILE]: "stale content" });
    const logger = new CapturingLogger();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      logger,
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      recreateFrameworkIfMissing: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.binaryMissing).toEqual([{ toolId: "claude", binary: "claude" }]);
    expect(fs.has(OLD_CACHE_FILE)).toBe(true);
    expect(logger.warnMessages.some((w) => w.includes("pre-migration framework cache kept"))).toBe(
      true
    );
  });

  // A build that fails is warned about and skipped, never an error — so the host's own
  // registration is left exactly where it was, possibly still on this project's
  // pre-migration cache. Same hazard as a missing binary, same answer.
  it("keeps the stale built tree in place, and warns, when a requested tool's build failed", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: true });
    const fs = new InMemoryFileAdapter({ [OLD_CACHE_FILE]: "stale content" });
    const logger = new CapturingLogger();
    const failingBuild = {
      execute: async () => {
        throw new Error("translator refused the source");
      },
    };
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      logger,
      new Map([["claude", activator]]),
      failingBuild,
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      recreateFrameworkIfMissing: true,
    });

    expect(result.errors).toEqual([]);
    expect(activator.addedMarketplaces).toEqual([]);
    expect(fs.has(OLD_CACHE_FILE)).toBe(true);
    expect(logger.warnMessages.some((w) => w.includes("pre-migration framework cache kept"))).toBe(
      true
    );
  });

  it("leaves the stale built tree in place when this run reports an error", async () => {
    const registry = projectWithMigratableEntry();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({
      available: true,
      enablesPlugins: false,
      crashOnAddMarketplace: false,
    });
    // No catalog seeded at the built dir at all: `readMarketplaceCatalogIdentity`
    // finds nothing, `registerMarketplace` throws `UnreadableBuiltCatalogError`,
    // which `activateNativeTools` collects as a genuine error rather than a warning.
    const fs = new InMemoryFileAdapter({ [OLD_CACHE_FILE]: "stale content" });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      recreateFrameworkIfMissing: true,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(fs.has(OLD_CACHE_FILE)).toBe(true);
  });

  it("never deletes a candidate a symlink resolves outside the project root", async () => {
    const registry = projectWithMigratableEntry();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
    const escapedFile = "/etc/evil/still-here.txt";
    const fs = new InMemoryFileAdapter({
      [escapedFile]: "not aidd's to delete",
      [`${CLAUDE_BUILT_DIR}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    fs.setSymlink(OLD_CACHE_DIR, "/etc/evil");
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    expect(fs.has(escapedFile)).toBe(true);
  });

  it("purges only after native activation has run against the still-present cache, never before", async () => {
    class OrderObservingActivator implements NativePluginActivator {
      readonly cacheStillPresentAtAdd: boolean[] = [];
      constructor(
        private readonly fs: InMemoryFileAdapter,
        private readonly probe: string
      ) {}
      isAvailable(): boolean {
        return true;
      }
      enablesPlugins(): boolean {
        return false;
      }
      addMarketplace(): void {
        this.cacheStillPresentAtAdd.push(this.fs.has(this.probe));
      }
      removeMarketplace(): void {}
      registrationState(): "live" | "dead" | "unknown" {
        return "unknown";
      }
      upgradeMarketplaces(): void {}
      enablePlugin(): void {}
      uninstallPlugin(): void {}
    }

    const registry = projectWithMigratableEntry();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const fs = new InMemoryFileAdapter({
      [OLD_CACHE_FILE]: "stale content",
      [`${CLAUDE_BUILT_DIR}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const activator = new OrderObservingActivator(fs, OLD_CACHE_FILE);
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => CLAUDE_BUILT_DIR),
      new Map(),
      () => "",
      new MarketplaceRegisterFrameworkUseCase(registry)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    expect(activator.cacheStillPresentAtAdd).toEqual([true]);
    expect(fs.has(OLD_CACHE_FILE)).toBe(false);
  });
});

describe("MarketplaceSyncSettingsUseCase + DoctorRegistrationUseCase — the full migration cycle", () => {
  /** Reads live from a `Map` the test's own activator double mutates on
   * `addMarketplace` — a real host and this CLI's own activator share exactly this
   * relationship (one file, read by `doctor`, written by `sync`'s own native
   * activation), so this is the one double that lets a `doctor` call made *after* a
   * `sync` call see what that `sync` actually did, rather than a canned reading. */
  class LiveHostMarketplaceRegistryReader {
    constructor(
      private readonly entries: Map<string, string>,
      private readonly location: string
    ) {}
    async read() {
      return { location: this.location, entries: new Map(this.entries) };
    }
  }

  class RegisteringActivator implements NativePluginActivator {
    constructor(private readonly hostEntries: Map<string, string>) {}
    isAvailable(): boolean {
      return true;
    }
    enablesPlugins(): boolean {
      return false;
    }
    addMarketplace(source: string): void {
      this.hostEntries.set(FRAMEWORK_MARKETPLACE_NAME, source);
    }
    removeMarketplace(): void {}
    registrationState(): "live" | "dead" | "unknown" {
      return "unknown";
    }
    upgradeMarketplaces(): void {}
    enablePlugin(): void {}
    uninstallPlugin(): void {}
  }

  it("goes from doctor warning to doctor healthy across one sync, leaving another project's own marketplace untouched", async () => {
    const PROJECT_A = "/project-a";
    const PROJECT_B = "/project-b";
    const REGISTRY_LOCATION = "/home/.claude/plugins/known_marketplaces.json";
    const CURRENT_VERSION = "2.0.0";
    const USER_CACHE_ROOT = "/user-cache";
    const sharedBuiltDir = userBuiltMarketplaceDir(
      USER_CACHE_ROOT,
      CURRENT_VERSION,
      FRAMEWORK_MARKETPLACE_NAME,
      "claude"
    );
    const preMigrationCache = resolve(
      builtMarketplaceDir(PROJECT_A, FRAMEWORK_MARKETPLACE_NAME, "claude")
    );

    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_A,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "." },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    await registry.save(
      PROJECT_B,
      Marketplace.create({
        name: "project-b-plugins",
        source: { kind: "local", path: "/project-b/plugins" },
        scope: "user",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );

    const hostEntries = new Map<string, string>([[FRAMEWORK_MARKETPLACE_NAME, preMigrationCache]]);
    const hostReader = new LiveHostMarketplaceRegistryReader(hostEntries, REGISTRY_LOCATION);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);

    const doctor = new DoctorRegistrationUseCase(
      new InMemoryFileAdapter({
        [`${sharedBuiltDir}/${CATALOG_RELATIVE}`]: JSON.stringify({
          name: FRAMEWORK_MARKETPLACE_NAME,
          plugins: [],
        }),
      }),
      registry,
      new Map(),
      new Map(),
      new Map([["claude", hostReader]]),
      () => USER_CACHE_ROOT,
      fakeVersion(CURRENT_VERSION)
    );

    const before = await doctor.execute({ manifest, projectRoot: PROJECT_A, allowedIds: null });
    expect(before.some((issue) => issue.fix.includes("aidd sync"))).toBe(true);

    const activator = new RegisteringActivator(hostEntries);
    const syncFs = new InMemoryFileAdapter({
      [`${sharedBuiltDir}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: FRAMEWORK_MARKETPLACE_NAME,
        version: CURRENT_VERSION,
        plugins: [],
      }),
    });
    const sync = new MarketplaceSyncSettingsUseCase(
      syncFs,
      new InMemoryManifestRepository(manifest),
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace(() => sharedBuiltDir),
      new Map([["claude", hostReader]]),
      () => USER_CACHE_ROOT,
      new MarketplaceRegisterFrameworkUseCase(registry),
      undefined,
      fakeVersion(CURRENT_VERSION)
    );

    const syncResult = await sync.execute({
      projectRoot: PROJECT_A,
      recreateFrameworkIfMissing: true,
    });
    expect(syncResult.errors).toEqual([]);

    const after = await doctor.execute({ manifest, projectRoot: PROJECT_A, allowedIds: null });
    expect(after).toEqual([]);

    const projectBEntries = await registry.list(PROJECT_B);
    expect(projectBEntries.map((m) => m.name)).toContain("project-b-plugins");
  });
});
