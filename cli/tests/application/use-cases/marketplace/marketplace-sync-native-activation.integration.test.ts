import "../../../../src/domain/tools/ai/claude.js";
import { describe, expect, it } from "vitest";
import { MarketplaceSyncSettingsUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import { buildHostRegistration } from "../../../../src/domain/models/telemetry-setup.js";
import type { PluginCatalogRepository } from "../../../../src/domain/ports/plugin-catalog-repository.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

/**
 * The seam #703 is about, from the writing side.
 *
 * `aidd` declares a plugin in a project's own settings, and the host loads it only once
 * that host's own CLI has registered it — `activateNativeTools` is what performs that
 * second half. Nothing asserted it: `marketplace-sync-settings-use-case.ts` had no test
 * file at all, so the one act that makes a declared plugin actually load was covered
 * nowhere, on the branch that shipped it.
 *
 * The pairing that matters is the ref. This file proves the activation is driven with the
 * same `<plugin>@<marketplace>` string `TelemetryHostRegistrationSetup` looks up, so the
 * two halves cannot drift into disagreeing about what to call one plugin — the failure the
 * diagnostic exists to report would otherwise become a failure it invents.
 */
const PROJECT_ROOT = "/test-project";
const MARKETPLACE = "aidd-framework";
const PLUGIN = "aidd-telemetry";
const REF = `${PLUGIN}@${MARKETPLACE}`;

const NO_CATALOG: PluginCatalogRepository = {
  load: async () => null,
  loadForeign: async () => [],
};

function marketplace(): Marketplace {
  return Marketplace.create({
    name: MARKETPLACE,
    source: { kind: "github", repo: "ai-driven-dev/framework" },
    scope: "project",
    addedAt: "2026-09-02T00:00:00Z",
  });
}

function manifestWithPlugin(): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin(
    "claude",
    Plugin.fromMetadata(
      PLUGIN,
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/framework" },
      true,
      MARKETPLACE
    )
  );
  return new InMemoryManifestRepository(manifest);
}

function buildSync(activator: FakeNativePluginActivator) {
  const registry = new InMemoryMarketplaceRegistry();
  return {
    registry,
    useCase: new MarketplaceSyncSettingsUseCase(
      new InMemoryFileAdapter(),
      manifestWithPlugin(),
      registry,
      NO_CATALOG,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    ),
  };
}

describe("syncing settings registers the plugin with the host's own CLI", () => {
  it("drives the host CLI with the same ref the diagnostic looks up", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry } = buildSync(activator);
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toContain(REF);
    // The other half of the pairing: the ref the comparison asks a registry about. If either
    // side ever spells it differently, this line and the one above stop agreeing.
    const asked = buildHostRegistration([
      {
        tool: "claude",
        plugins: [{ name: PLUGIN, marketplace: MARKETPLACE }],
        reading: { location: "/registry", refs: new Map([[REF, true]]) },
      },
    ]);
    expect(asked.entries[0]?.ref).toBe(activator.enabledPlugins[0]);
  });

  // The #703 state itself, from this side: the settings are written, the host CLI is absent,
  // and nothing registers. The diagnostic is the only thing that can then tell a person.
  it("registers nothing when the host CLI is not available, and does not fail the sync", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const { useCase, registry } = buildSync(activator);
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toEqual([]);
  });
});
