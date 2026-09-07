import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { userBuiltMarketplaceDir } from "../../../../../src/kernel/paths.js";
import type { MarketplaceScope } from "../../../../../src/kernel/scope.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeHostMarketplaceRegistryReader } from "../../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const REGISTRY_LOCATION = "/home/.claude/plugins/known_marketplaces.json";
const USER_CACHE_ROOT = "/user-cache";
const MARKETPLACE_NAME = "probe-mkt";

function sharedPath(version: string): string {
  return userBuiltMarketplaceDir(USER_CACHE_ROOT, version, MARKETPLACE_NAME, "claude");
}

async function sync(options: {
  requestedVersion: string;
  registeredPath?: string;
  registeredVersion?: string;
  scope?: MarketplaceScope;
}) {
  const fs = new InMemoryFileAdapter();
  const manifestRepo = new InMemoryManifestRepository();
  const registry = new InMemoryMarketplaceRegistry();
  const logger = new CapturingLogger();
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  await manifestRepo.save(manifest);
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: MARKETPLACE_NAME,
      source: { kind: "local", path: "/source" },
      scope: options.scope ?? "user",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  const builtDir = sharedPath(options.requestedVersion);
  await fs.writeFile(
    `${builtDir}/.claude-plugin/marketplace.json`,
    JSON.stringify({ name: MARKETPLACE_NAME, version: options.requestedVersion, plugins: [] })
  );
  if (options.registeredPath !== undefined) {
    await fs.writeFile(
      `${options.registeredPath}/.claude-plugin/marketplace.json`,
      JSON.stringify({ name: MARKETPLACE_NAME, version: options.registeredVersion, plugins: [] })
    );
  }
  const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
  const hostReader = new FakeHostMarketplaceRegistryReader({
    location: REGISTRY_LOCATION,
    entries:
      options.registeredPath === undefined
        ? new Map()
        : new Map([[MARKETPLACE_NAME, options.registeredPath]]),
  });
  const useCase = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    registry,
    new DeterministicHasher(),
    logger,
    new Map([["claude", activator]]),
    fakeEnsureBuiltMarketplace(() => builtDir),
    new Map([["claude", hostReader]]),
    () => USER_CACHE_ROOT
  );
  const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
  return { result, activator, logger };
}

describe("the sync write path refuses to roll a host back to an older aidd-framework build", () => {
  // Bloquant 3: the host already follows a newer build of the shared source than
  // this run would request — writing anyway would silently repoint it backward.
  it("writes nothing and warns naming both versions and `aidd update`, when the host already follows a newer shared build", async () => {
    const { result, activator, logger } = await sync({
      requestedVersion: "1.0.0",
      registeredPath: sharedPath("2.0.0"),
      registeredVersion: "2.0.0",
    });

    expect(activator.addedMarketplaces).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(
      logger.warnMessages.some(
        (m) => m.includes("2.0.0") && m.includes("1.0.0") && m.includes("aidd update")
      )
    ).toBe(true);
    expect(result.warnings.some((m) => m.includes("aidd update"))).toBe(true);
  });

  // The migration itself: the host still points at this project's own pre-migration
  // cache, and this run's build is the newer, shared source — it must proceed.
  it("proceeds when the host still points at this project's own pre-migration cache", async () => {
    const { result, activator } = await sync({
      requestedVersion: "1.0.0",
      registeredPath: `${PROJECT_ROOT}/.aidd/cache/built/${MARKETPLACE_NAME}/claude`,
    });

    expect(activator.addedMarketplaces).toEqual([sharedPath("1.0.0")]);
    expect(result.errors).toEqual([]);
  });

  it("proceeds when the host already follows an older shared build — a legitimate update, not a rollback", async () => {
    const { result, activator } = await sync({
      requestedVersion: "2.0.0",
      registeredPath: sharedPath("1.0.0"),
      registeredVersion: "1.0.0",
    });

    expect(activator.addedMarketplaces).toEqual([sharedPath("2.0.0")]);
    expect(result.errors).toEqual([]);
  });

  it("does nothing extra when the host already follows this exact shared version", async () => {
    const { result, activator } = await sync({
      requestedVersion: "1.0.0",
      registeredPath: sharedPath("1.0.0"),
      registeredVersion: "1.0.0",
    });

    expect(activator.addedMarketplaces).toEqual([sharedPath("1.0.0")]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
