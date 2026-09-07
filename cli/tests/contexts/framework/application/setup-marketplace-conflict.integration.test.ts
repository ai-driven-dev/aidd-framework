import { describe, expect, it, vi } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import type { MarketplaceRefresh } from "../../../../src/contexts/distribution/application/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSourceMode } from "../../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../../../src/contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupToolsUseCase } from "../../../../src/contexts/framework/application/setup/setup-tools-use-case.js";
import { SetupUseCase } from "../../../../src/contexts/framework/application/setup-use-case.js";
import { SetupFlow } from "../../../../src/contexts/framework/domain/setup-flow.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { SetupPluginsPromptUseCase } from "../../../../src/presentation/prompts/setup-plugins-prompt-use-case.js";
import type { LatestReleaseResolver } from "../../../../src/runtime/self-update/latest-release-resolver.js";
import { buildUnitDeps } from "../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeHostMarketplaceRegistryReader } from "../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { OverwritePrompter } from "../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";
const REGISTRY_LOCATION = "/home/.claude/plugins/known_marketplaces.json";

function makeNoOpLatestResolver(): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(true),
  };
}

function makeNoOpMarketplaceRegisterFramework(): MarketplaceRegisterFramework {
  return { execute: vi.fn().mockResolvedValue({ registered: false }) };
}

function makeNoOpMarketplaceRefresh(): MarketplaceRefresh {
  return { execute: vi.fn().mockResolvedValue({ results: [], failedCount: 0 }) };
}

function makeNoOpPluginInstallFromMarketplace(): PluginInstallFromMarketplace {
  return { execute: vi.fn() };
}

/**
 * `setup` at the end of its own flow drives the same native activation `sync` does
 * (`syncSettings`), but until this lot only ever threw the result away: a marketplace
 * source-conflict guard refusing there used to leave `aidd setup` exiting 0 with the
 * marketplace never actually registered on the host, and nobody told. This wires a
 * REAL `MarketplaceSyncSettingsUseCase` (not the no-op double `setup-use-case.unit.test.ts`
 * substitutes it with) behind a host registry that already holds a genuinely different
 * catalog under the marketplace's own name, so `execute()` reaches a real conflict.
 */
async function buildUseCaseWithConflict() {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  const prompter = new OverwritePrompter();
  const setupMarketplaceSourceUseCase = new SetupMarketplaceSourceUseCase(
    prompter,
    makeNoOpLatestResolver()
  );
  const setupToolsUseCase = new SetupToolsUseCase(
    deps.manifestRepo,
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase
  );
  const setupPluginsPromptUseCase = new SetupPluginsPromptUseCase(
    { execute: vi.fn() },
    makeNoOpPluginInstallFromMarketplace(),
    new InMemoryMarketplaceRegistry(),
    { execute: vi.fn() }
  );

  // The marketplace this project already knows, and the built catalog a real sync
  // would read back — same wiring `flows/marketplace-source-conflict.integration.test.ts`
  // uses directly against `MarketplaceSyncSettingsUseCase`, driven here through `setup`.
  await deps.marketplaceRegistry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: "probe-mkt",
      source: { kind: "local", path: "/source/probe-mkt" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  await deps.fs.writeFile(
    "/built/claude/.claude-plugin/marketplace.json",
    JSON.stringify({ name: "probe-mkt", version: "1.0.0", plugins: [{ name: "sample-plugin" }] })
  );
  await deps.fs.writeFile(
    "/other/src/.claude-plugin/marketplace.json",
    JSON.stringify({ name: "probe-mkt", version: "2.0.0", plugins: [{ name: "different-plugin" }] })
  );
  const hostReader = new FakeHostMarketplaceRegistryReader({
    location: REGISTRY_LOCATION,
    entries: new Map([["probe-mkt", "/other/src"]]),
  });
  const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
  const marketplaceSyncSettingsUseCase = new MarketplaceSyncSettingsUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.marketplaceRegistry,
    deps.hasher,
    deps.logger,
    new Map([["claude", activator]]),
    fakeEnsureBuiltMarketplace((target) => `/built/${target}`),
    new Map([["claude", hostReader]])
  );

  const useCase = new SetupUseCase(
    deps.fs,
    deps.manifestRepo,
    setupMarketplaceSourceUseCase,
    makeNoOpMarketplaceRegisterFramework(),
    makeNoOpMarketplaceRefresh(),
    marketplaceSyncSettingsUseCase,
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    deps.currentVersionProvider
  );
  return { useCase, activator };
}

function remoteFlow(aiTools: ToolId[]): SetupFlow {
  return new SetupFlow({
    projectRoot: PROJECT_ROOT,
    source: MarketplaceSourceMode.remote(),
    aiTools,
    ideTools: [],
    pluginMode: "none",
    interactive: false,
  });
}

describe("setup surfaces a marketplace source conflict instead of exiting clean", () => {
  it("reports the conflict in its own activation result rather than discarding it", async () => {
    const { useCase, activator } = await buildUseCaseWithConflict();

    const result = await useCase.execute(remoteFlow(["claude" as ToolId]));

    expect(activator.addedMarketplaces).toHaveLength(0);
    expect(result.activation.errors).toHaveLength(1);
    expect(result.activation.errors[0]?.message).toMatch(/different catalog/);
    expect(result.activation.errors[0]?.message).toMatch(/probe-mkt/);
  });
});
