import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { AiToolId } from "../../../../../src/kernel/tool.js";
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

interface RegisteredCatalog {
  /** Where the host's registry resolves the name to — the directory a catalog would
   * be read from, if anything was ever written there. */
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
  readonly pluginNames?: readonly string[];
}

interface Setup {
  readonly toolId?: AiToolId;
  /** `name` written into the built catalog's own marketplace.json — defaults to the
   * aidd-side name so most scenarios agree by construction. */
  readonly catalogName?: string;
  readonly aiddName?: string;
  readonly requestedVersion?: string;
  readonly requestedPluginNames?: readonly string[];
  readonly hostReader?: FakeHostMarketplaceRegistryReader;
  /** Catalog content to pre-write at the path this test's `hostReader` names as
   * registered — omitted entirely leaves that path with nothing readable, standing in
   * for a dead entry (a directory that no longer exists). */
  readonly registeredCatalog?: RegisteredCatalog;
  /** Skips writing anything at the built dir this project just "built" to — standing
   * in for a build that reported success but left nothing readable at the exact path
   * its own tool profile probes. */
  readonly omitRequestedCatalog?: boolean;
}

async function sync(setup: Setup = {}) {
  const toolId = setup.toolId ?? "claude";
  const aiddName = setup.aiddName ?? "probe-mkt";
  const catalogName = setup.catalogName ?? aiddName;
  const fs = new InMemoryFileAdapter();
  const manifestRepo = new InMemoryManifestRepository();
  const registry = new InMemoryMarketplaceRegistry();
  const logger = new CapturingLogger();
  const manifest = Manifest.create();
  manifest.addTool(toolId, "test", []);
  await manifestRepo.save(manifest);
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: aiddName,
      source: { kind: "local", path: `/source/${aiddName}` },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  const builtDir = `/built/${toolId}`;
  // Written at whichever relative path this tool's own `distributionProbes.marketplace`
  // names — codex's differs from claude's — so a mutation that skips the
  // `marketplaceRegistry` gate is actually exercised for codex too, rather than
  // passing by accident because nothing sits at the path it would have read.
  const catalogRelative =
    toolId === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json";
  if (!setup.omitRequestedCatalog) {
    await fs.writeFile(
      `${builtDir}/${catalogRelative}`,
      JSON.stringify({
        name: catalogName,
        version: setup.requestedVersion,
        plugins: (setup.requestedPluginNames ?? []).map((name) => ({ name })),
      })
    );
  }
  if (setup.registeredCatalog !== undefined) {
    const rc = setup.registeredCatalog;
    await fs.writeFile(
      `${rc.path}/${catalogRelative}`,
      JSON.stringify({
        name: rc.name ?? catalogName,
        version: rc.version,
        plugins: (rc.pluginNames ?? []).map((name) => ({ name })),
      })
    );
  }
  const activator = new FakeNativePluginActivator({ available: true, enablesPlugins: false });
  const hostRegistries = new Map(
    setup.hostReader === undefined
      ? []
      : ([[toolId, setup.hostReader]] as [AiToolId, FakeHostMarketplaceRegistryReader][])
  );
  const useCase = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    registry,
    new DeterministicHasher(),
    logger,
    new Map([[toolId === "claude" ? "claude" : "codex", activator]]),
    fakeEnsureBuiltMarketplace((target) => `/built/${target}`),
    hostRegistries
  );
  const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
  return { result, activator, manifestRepo, builtDir, catalogRelative };
}

describe("the sync guard against a marketplace name a host already holds", () => {
  it("refuses when a different catalog is registered under the same name, and names both sources and the plugin difference", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([["probe-mkt", "/other/src"]]),
    });

    const { result, activator } = await sync({
      hostReader,
      requestedPluginNames: ["sample-plugin"],
      registeredCatalog: { path: "/other/src", pluginNames: ["different-plugin"] },
    });

    expect(activator.addedMarketplaces).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/different catalog/);
    expect(result.errors[0]?.message).toMatch(/probe-mkt/);
    expect(result.errors[0]?.message).toMatch(/\/other\/src/);
    expect(result.errors[0]?.message).toMatch(/\+sample-plugin/);
    expect(result.errors[0]?.message).toMatch(/-different-plugin/);
  });

  it("does not refuse when only the version differs under the same name and plugin set — the host repointing to a newer build it already knows, not a different marketplace", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([["probe-mkt", "/other/src"]]),
    });

    const { result, activator } = await sync({
      hostReader,
      requestedVersion: "2.0.0",
      requestedPluginNames: ["sample-plugin"],
      registeredCatalog: { path: "/other/src", version: "1.0.0", pluginNames: ["sample-plugin"] },
    });

    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);
    expect(result.errors).toEqual([]);
  });

  it("does not refuse when the host's registry already holds the same resolved source", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      // InMemoryFileAdapter.realpath is identity absent a declared symlink, so this is
      // exactly what the guard resolves `builtDir` to — the same file both reads land
      // on, trivially the same catalog.
      entries: new Map([["probe-mkt", "/built/claude"]]),
    });

    const { result, activator } = await sync({ hostReader });

    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);
    expect(result.errors).toEqual([]);
  });

  it("does not refuse when the same catalog is registered from a different, resolved path — two projects sharing one build", async () => {
    // The measured `smoke-tools.sh` case: two independent projects both build the
    // same framework fixture to their own `.aidd/cache/built/…`, and both auto-register
    // under the same name. Same name, same version, same plugin names — a different
    // directory only because it is a different project, not a different marketplace.
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([["probe-mkt", "/other-project/built/claude"]]),
    });

    const { result, activator } = await sync({
      hostReader,
      requestedVersion: "1.0.0",
      requestedPluginNames: ["sample-plugin"],
      registeredCatalog: {
        path: "/other-project/built/claude",
        version: "1.0.0",
        pluginNames: ["sample-plugin"],
      },
    });

    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);
    expect(result.errors).toEqual([]);
  });

  it("does not refuse when the registered source no longer resolves to a readable catalog — a dead entry a re-add repairs", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([["probe-mkt", "/gone"]]),
    });

    // No `registeredCatalog` — nothing is ever written at "/gone", so reading its
    // catalog fails exactly as it would for a directory that no longer exists.
    const { result, activator } = await sync({ hostReader });

    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);
    expect(result.errors).toEqual([]);
  });

  it("registers freely when this project's own local alias diverges from its built catalog's own name — a supported capability, not a fault", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map(),
    });

    const { result, activator } = await sync({
      aiddName: "mon-nom",
      catalogName: "upstream",
      hostReader,
    });

    expect(activator.addedMarketplaces).toEqual(["/built/claude"]);
    expect(result.errors).toEqual([]);
  });

  it("never reads a host registry for a tool whose profile declares none, and still registers it", async () => {
    // Codex's own profile declares no `marketplaceRegistry` — this reader would refuse
    // every request if it were ever consulted, which is exactly what proves it is not.
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: "/wherever",
      entries: new Map([["probe-mkt", "/anything-else"]]),
    });

    const { result, activator } = await sync({ toolId: "codex", hostReader });

    expect(hostReader.reads).toBe(0);
    expect(activator.addedMarketplaces).toEqual(["/built/codex"]);
    expect(result.errors).toEqual([]);
  });
});

describe("when the catalog this project just built cannot be read back", () => {
  it("registers nothing and reports an error naming the unreadable file, rather than falling back to this project's own local alias", async () => {
    const { result, activator, manifestRepo, builtDir, catalogRelative } = await sync({
      aiddName: "mon-nom",
      omitRequestedCatalog: true,
    });

    expect(activator.addedMarketplaces).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain(`${builtDir}/${catalogRelative}`);
    // Never written as `hostName` — a manifest that guessed the alias would go on
    // claiming a registration the host was never asked to hold.
    const reloaded = await manifestRepo.load();
    expect(reloaded?.getNativeRegistrations("claude")).toBeUndefined();
  });
});
