import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { DoctorRegistrationUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { buildHostRegistration } from "../../../../../src/contexts/tools/domain/host-plugin-registration.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../../../../src/contexts/tools/domain/ports/host-plugin-registry-reader.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

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
 * same `<plugin>@<marketplace>` string `buildHostRegistration` looks up, so the
 * two halves cannot drift into disagreeing about what to call one plugin — the failure the
 * diagnostic exists to report would otherwise become a failure it invents.
 */
const PROJECT_ROOT = "/test-project";
const MARKETPLACE = "aidd-framework";
const PLUGIN = "aidd-telemetry";
const REF = `${PLUGIN}@${MARKETPLACE}`;

function marketplace(): Marketplace {
  return Marketplace.create({
    name: MARKETPLACE,
    source: { kind: "github", repo: "ai-driven-dev/framework" },
    scope: "project",
    addedAt: "2026-09-02T00:00:00Z",
  });
}

function manifestWithPlugin(marketplace: string = MARKETPLACE): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromMetadata(
      PLUGIN,
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/framework" },
      true,
      "project",
      marketplace
    )
  );
  return new InMemoryManifestRepository(manifest);
}

/** What `readMarketplaceCatalogIdentity` reads back for the one marketplace `marketplace()`
 * registers, built to the one directory `fakeEnsureBuiltMarketplace()`'s default resolves
 * "claude" to — a real build always leaves a readable catalog there, so a fixture standing
 * in for one must too, now that an unreadable catalog is a hard failure rather than a
 * silent fall back to this project's own local alias (see `UnreadableBuiltCatalogError`). */
function seededBuiltCatalog(): InMemoryFileAdapter {
  return new InMemoryFileAdapter({
    "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
      name: MARKETPLACE,
      version: "1.0.0",
      plugins: [{ name: PLUGIN }],
    }),
  });
}

function buildSync(activator: FakeNativePluginActivator, pluginMarketplace?: string) {
  const registry = new InMemoryMarketplaceRegistry();
  const fs = seededBuiltCatalog();
  const manifestRepo = manifestWithPlugin(pluginMarketplace);
  const hasher = new DeterministicHasher();
  return {
    registry,
    fs,
    manifestRepo,
    hasher,
    useCase: new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    ),
  };
}

const SETTINGS_PATH = ".claude/settings.json";

/** `resolve`, exactly as `syncMarketplacesFile` does — not a `/`-joined literal. On Windows
 * the production key is `C:\\test-project\\.claude\\settings.json`, and a hand-built POSIX
 * path addresses a file the use case never wrote. */
function settingsPathIn(projectRoot: string): string {
  return resolve(projectRoot, SETTINGS_PATH);
}

/** What the host's own CLI does that this code cannot see: `claude plugin marketplace add`
 * and `claude plugin enable` write their result into the very file `syncTool` just hashed.
 * The fake shells out to nothing, so it stands in for that write directly. */
class ActivatorThatWritesSettings extends FakeNativePluginActivator {
  constructor(
    private readonly fs: InMemoryFileAdapter,
    private readonly settingsAbsolutePath: string
  ) {
    super({ available: true });
  }

  private readonly writes: Promise<void>[] = [];

  async settled(): Promise<void> {
    await Promise.all(this.writes);
  }

  private async appendHostState(): Promise<void> {
    const before = await this.fs.readFile(this.settingsAbsolutePath).catch(() => "{}");
    const json = JSON.parse(before) as Record<string, unknown>;
    // Not a key this code writes: the point is content only the host could have put there.
    json.installedPluginsBookkeeping = { [REF]: { installedAt: "2026-09-05T00:00:00Z" } };
    await this.fs.writeFile(this.settingsAbsolutePath, JSON.stringify(json, null, 2));
  }

  override addMarketplace(source: string): void {
    super.addMarketplace(source);
    this.writes.push(this.appendHostState());
  }

  override enablePlugin(pluginRef: string): void {
    super.enablePlugin(pluginRef);
    this.writes.push(this.appendHostState());
  }
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

  /**
   * The half of the disagreement the contract argues hardest for, and the reason the
   * comparison starts from the manifest rather than from a settings file.
   *
   * `mergeEnabledPlugins` skips a plugin whose marketplace does not resolve — silently,
   * with a bare `continue`. So this plugin reaches no settings file and no host CLI, while
   * AIDD's own manifest says it is installed. A diagnostic reading settings against a
   * registry would find both sides absent and call that agreement; reading the manifest
   * against the registry is what makes it visible.
   */
  it("registers nothing for a plugin whose marketplace does not resolve, and says nothing about it", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry } = buildSync(activator, "a-marketplace-nobody-added");
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toEqual([]);
    // And the manifest still carries it, which is the only place it can now be seen from.
    const entry = buildHostRegistration([
      {
        tool: "claude",
        plugins: [{ name: PLUGIN, marketplace: "a-marketplace-nobody-added" }],
        reading: { location: "/registry", refs: new Map() },
      },
    ]).entries[0];

    expect(entry?.answer).toBe("not-registered");
  });
});

/**
 * The manifest's own record of what a tool's CLI was asked to register — what `doctor`
 * later compares against the host's real registry, and `clean` undoes through the same
 * binary. Written only for a tool this run actually activated, mirroring the rule
 * `recordWhatActivationWrote` already holds for the settings-file hash.
 */
describe("nativeRegistrations reflects what the host's own CLI was asked to register", () => {
  it("records binary, marketplaces and pluginRefs after a successful activation", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry, manifestRepo } = buildSync(activator);
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const reloaded = await manifestRepo.load();
    expect(reloaded?.getNativeRegistrations("claude")).toEqual({
      binary: "claude",
      marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
      pluginRefs: [REF],
    });
  });

  it("records nothing when the host CLI is not available", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const { useCase, registry, manifestRepo } = buildSync(activator);
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const reloaded = await manifestRepo.load();
    expect(reloaded?.getNativeRegistrations("claude")).toBeUndefined();
  });

  /**
   * What `sync` exists to repair: the manifest still carries a prior run's
   * `nativeRegistrations`, but the host's own registry has lost it (a machine re-clone, a
   * person clearing it by hand) — the fake starts with none of what it was asked to
   * register on a previous run. Running `execute` again is what `sync` now does, and it
   * must drive the CLI again rather than trust the stale manifest record.
   */
  it("re-registers through the host CLI when the manifest's record has gone stale", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry, manifestRepo } = buildSync(activator);
    const staleManifest = await manifestRepo.load();
    staleManifest?.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
      pluginRefs: [REF],
    });
    if (staleManifest) await manifestRepo.save(staleManifest);
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toContain(REF);
    const reloaded = await manifestRepo.load();
    expect(reloaded?.getNativeRegistrations("claude")).toEqual({
      binary: "claude",
      marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
      pluginRefs: [REF],
    });
  });

  /**
   * The coordinator's own scenario: this project's local alias for a marketplace
   * (`MARKETPLACE`, what its own registry and `manifestWithPlugin` both key it by) is
   * free to differ from what the catalog it builds actually declares itself as — a
   * supported capability, never a fault, since v8. `claude` only ever knows the
   * marketplace by its catalog's own name, so the ref driven through `enablePlugin`
   * and the name recorded in `nativeRegistrations` must both follow the catalog, never
   * the alias.
   */
  it("drives the host CLI and records the catalog's own name when this project's local alias differs from it", async () => {
    const CATALOG_NAME = "aidd-framework-catalog";
    const activator = new FakeNativePluginActivator({ available: true });
    const registry = new InMemoryMarketplaceRegistry();
    const fs = new InMemoryFileAdapter({
      "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
        name: CATALOG_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const manifestRepo = manifestWithPlugin();
    const hasher = new DeterministicHasher();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.enabledPlugins).toEqual([`${PLUGIN}@${CATALOG_NAME}`]);
    expect(activator.enabledPlugins).not.toContain(REF);
    const reloaded = await manifestRepo.load();
    expect(reloaded?.getNativeRegistrations("claude")).toEqual({
      binary: "claude",
      marketplaces: [{ alias: MARKETPLACE, hostName: CATALOG_NAME }],
      pluginRefs: [`${PLUGIN}@${CATALOG_NAME}`],
    });
  });
});

/**
 * Declaring a marketplace and installing a plugin from it are two acts, and a person
 * does the first alone all the time — `activateTool` registers every known marketplace
 * regardless of whether the manifest names a plugin for it. Nothing above exercises a
 * manifest with zero plugins: `buildSync` always installs one, so a guard reintroduced
 * at the top of `activateTool` (`if (refs.length === 0) return false;`) would still pass
 * every test in this file. This is the one that catches it.
 */
describe("registering a marketplace does not wait for a plugin to point at it", () => {
  it("registers every known marketplace even when the manifest declares no plugin", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const registry = new InMemoryMarketplaceRegistry();
    const fs = seededBuiltCatalog();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const manifestRepo = new InMemoryManifestRepository(manifest);
    const hasher = new DeterministicHasher();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.addedMarketplaces).not.toEqual([]);
  });
});

/**
 * `syncTool` writes `.claude/settings.json`, hashes what it wrote, and the manifest is saved.
 * Only then does `activateNativeTools` run the host's own CLI — which writes into that same
 * file, because Claude Code declares one `settingsPath` for both marketplaces and enabled
 * plugins.
 *
 * So the tracked hash describes content that no longer exists the moment activation
 * succeeds. Nothing re-hashes it. `status` and `doctor` report a file the user never touched
 * as drifted, for as long as the manifest stands, and `restore` would undo the host's own
 * registration to get back to a state AIDD only ever held for the length of one function.
 *
 * The one case in this file that is about what the activation leaves behind rather than what
 * it was driven with.
 */
describe("what native activation leaves behind is not reported as the user's drift", () => {
  it("tracks a hash that still matches the settings file after the host CLI has written to it", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    const fs = seededBuiltCatalog();
    const manifestRepo = manifestWithPlugin();
    const hasher = new DeterministicHasher();
    const settingsAbsolutePath = settingsPathIn(PROJECT_ROOT);
    const activator = new ActivatorThatWritesSettings(fs, settingsAbsolutePath);
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });
    // The port is synchronous and the host CLI's write is not, so let the writes the
    // activator queued actually land before reading the file back.
    await activator.settled();

    const onDisk = await fs.readFile(settingsAbsolutePath);
    const manifest = await manifestRepo.load();
    const tracked = manifest?.getToolFiles("claude") ?? [];
    const entry = tracked.find((file) => file.relativePath === SETTINGS_PATH);

    expect(entry, "the settings file is tracked at all").toBeDefined();
    expect(entry?.hash).toEqual(hasher.hash(onDisk));
  });
  /**
   * The other half, and the one that keeps the repair honest. A tool whose CLI is not on the
   * PATH wrote nothing, so a settings file that differs from its tracked hash differs because
   * a person changed it — which is exactly the drift `status` exists to report and `restore`
   * exists to undo. Re-hashing every tool after activation would bless that as ours and
   * silently make the change permanent.
   */
  it("leaves a hash alone for a tool whose own CLI never ran", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    const fs = new InMemoryFileAdapter();
    const manifestRepo = manifestWithPlugin();
    const hasher = new DeterministicHasher();
    const settingsAbsolutePath = settingsPathIn(PROJECT_ROOT);
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      // Not available: the binary is not on the PATH, so nothing of the host's is written.
      new Map([["claude", new FakeNativePluginActivator({ available: false })]]),
      fakeEnsureBuiltMarketplace()
    );
    await registry.save(PROJECT_ROOT, marketplace());
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    const hashAfterSync = (await manifestRepo.load())
      ?.getToolFiles("claude")
      .find((file) => file.relativePath === SETTINGS_PATH)?.hash;

    // A person edits the file, then a second sync runs and changes nothing else.
    const edited = `${await fs.readFile(settingsAbsolutePath)}\n`;
    await fs.writeFile(settingsAbsolutePath, edited);
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const tracked = (await manifestRepo.load())
      ?.getToolFiles("claude")
      .find((file) => file.relativePath === SETTINGS_PATH);
    expect(hashAfterSync, "the settings file is tracked at all").toBeDefined();
    expect(tracked?.hash).toEqual(hashAfterSync);
    expect(tracked?.hash).not.toEqual(hasher.hash(edited));
  });
});

/**
 * `reclaimOrReport` fires when the host's own `add` refuses a name already held — dead
 * or live decides whether this project may reclaim it. Both the check and the reclaim
 * itself are host-facing calls, so both must ask about, and act on, the catalog's own
 * name, never this project's local alias for it: asking about the alias would answer
 * "dead" for a registration the host actually holds live under its catalog's name, and
 * then force-remove a name the host never held.
 */
describe("reclaiming a dead registration asks and acts on the host's own name", () => {
  it("checks and removes the catalog's own name, not this project's local alias, before re-adding", async () => {
    const CATALOG_NAME = "aidd-framework-catalog";
    const activator = new FakeNativePluginActivator({
      available: true,
      conflictOnAdd: true,
      registrationState: "dead",
    });
    const registry = new InMemoryMarketplaceRegistry();
    const fs = new InMemoryFileAdapter({
      "/built/claude/.claude-plugin/marketplace.json": JSON.stringify({
        name: CATALOG_NAME,
        version: "1.0.0",
        plugins: [],
      }),
    });
    const manifestRepo = manifestWithPlugin();
    const hasher = new DeterministicHasher();
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      hasher,
      new CapturingLogger(),
      new Map([["claude", activator]]),
      fakeEnsureBuiltMarketplace()
    );
    await registry.save(PROJECT_ROOT, marketplace());

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(activator.removedMarketplaces).toEqual([CATALOG_NAME]);
    expect(activator.removedMarketplaces).not.toContain(MARKETPLACE);
    // The reclaim's second `addMarketplace` succeeded once `removedMarketplaces` was
    // non-empty (the fake's own `conflictOnAdd` bypass), so activation still finished.
    expect(activator.addedMarketplaces).not.toEqual([]);
  });
});

/**
 * The guard for the interface between the two lots: `doctor` reads the host's registry
 * (lot 1) and its fix names `aidd sync`; `sync` now drives the same activation this file
 * exercises everywhere else (lot 2). This composes both, with one activator double
 * standing in for the host CLI both sides look at, so `doctor` going healthy again is
 * read from the same state `sync` was asked to write — not from two doubles that happen
 * to agree by construction.
 */
describe("what doctor tells a person to run becomes true once sync has run", () => {
  /** Answers `read()` from the activator's own recorded state, so a registry reading
   * always reflects exactly what the last `execute()` asked the host CLI to enable. */
  class RegistryBoundToActivator implements HostPluginRegistryReader {
    constructor(private readonly activator: FakeNativePluginActivator) {}

    async read(): Promise<HostPluginRegistryReading> {
      return {
        location: "/home/dev/.claude/plugins/installed_plugins.json",
        refs: new Map(this.activator.enabledPlugins.map((ref) => [ref, true])),
      };
    }
  }

  it("goes from `aidd sync` to healthy after sync re-registers", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, registry, manifestRepo, fs } = buildSync(activator);
    await registry.save(PROJECT_ROOT, marketplace());
    const doctorRegistration = new DoctorRegistrationUseCase(
      fs,
      registry,
      new Map([["claude", activator]]),
      new Map([["claude", new RegistryBoundToActivator(activator)]]),
      new Map(),
      () => "/user-cache",
      { get: () => "1.0.0" }
    );
    // `buildSync` seeds the repository with a manifest already carrying a plugin, and
    // `MarketplaceSyncSettingsUseCase.execute` mutates that same instance in place rather
    // than replacing it — so one load, kept across both doctor calls below, sees the sync
    // that runs in between without needing a second, equally-unproven load.
    const manifest = await manifestRepo.load();
    expect(manifest, "buildSync always seeds a manifest").not.toBeNull();
    if (manifest === null) throw new Error("unreachable — asserted above");

    // Before sync ever ran: the host's registry carries nothing this project expects.
    const before = await doctorRegistration.execute({
      manifest,
      projectRoot: PROJECT_ROOT,
      allowedIds: null,
    });
    expect(
      before.some((issue) => issue.severity === "error" && issue.fix.includes("aidd sync"))
    ).toBe(true);

    // What `sync` now does: the same activation, re-registering through the same CLI.
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const after = await doctorRegistration.execute({
      manifest,
      projectRoot: PROJECT_ROOT,
      allowedIds: null,
    });
    expect(after.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
