/**
 * `clean` purging a host's own plugin cache — never on the manifest's word alone.
 *
 * Two measured leftovers, reconciled here (see aidd_docs/memory/architecture.md and
 * cli.md): `claude plugin uninstall` + `marketplace remove` leave the built tree in
 * full, marked `.orphaned_at`, never deleted; `codex plugin remove` deletes a
 * marketplace's cached content but leaves the now-empty `cache/<hostName>/` shell
 * behind — the residue `smoke:real` left in the real `$HOME` on every run before
 * `NativeActivation.pluginCacheDir` existed. Both measured 2026-09-07 against the real
 * binaries in a relocated HOME.
 *
 * A profile declaring `marketplaceRegistry` alongside `pluginCacheDir` (claude) gets
 * the full purge, gated on a fresh read of that registry no longer naming the host.
 * A profile declaring `pluginCacheDir` alone (codex) gets the narrower one: its own
 * cache directory is removed only once it is proven empty, since there is no registry
 * to reread. Copilot declares neither and is never touched (it copies nothing).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
// hostMarketplaceRegistryReaders (used by the HOME-parity test below) iterates every
// AI_TOOL_IDS entry, so every profile must be registered here too.
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { CleanUseCase } from "../../../../src/contexts/framework/application/clean-use-case.js";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import type {
  HostMarketplaceRegistryReader,
  HostMarketplaceRegistryReading,
} from "../../../../src/contexts/tools/domain/ports/host-marketplace-registry-reader.js";
import { hostMarketplaceRegistryReaders } from "../../../../src/contexts/tools/infrastructure/host-marketplace-registry-reader-adapter.js";
import { AIDD_DIR } from "../../../../src/kernel/paths.js";
import type { AiToolId } from "../../../../src/kernel/tool.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { FakeHostMarketplaceRegistryReader } from "../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
// Not injectable: CleanUseCase.execute() resolves `nodeHomedir()` itself. Using the
// same real function here — never a fixed literal — is what keeps every path below in
// sync with what the code under test actually composes.
const HOME = homedir();
const CLAUDE_CACHE_ROOT = join(HOME, ".claude", "plugins", "cache");
const CODEX_CACHE_ROOT = join(HOME, ".codex", "plugins", "cache");
const MARKETPLACE = "probe-mkt";
const REF = "plugin-a@probe-mkt";

/** Records every `deleteDirectory` call, so a test can prove containment refused one
 * without ever letting it run. */
class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly deletedDirectories: string[] = [];

  override async deleteDirectory(path: string): Promise<void> {
    this.deletedDirectories.push(path);
    return super.deleteDirectory(path);
  }
}

/** Fails `realpath` with a non-ENOENT error (EACCES) for one exact path, so a test can
 * prove `clean` treats that failure like containment — named and skipped — rather than
 * letting it abort the rest of the run. */
class RealpathDeniedFileAdapter extends RecordingFileAdapter {
  constructor(private readonly deniedPath: string) {
    super();
  }

  override async realpath(path: string): Promise<string> {
    if (path === this.deniedPath) {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    }
    return super.realpath(path);
  }
}

/**
 * A host's own marketplace registry, mirroring `activator.removedMarketplaces` at read
 * time instead of a fixed canned answer. This is what actually proves ordering: a
 * `purgeNativeCaches` that read the registry *before* driving `removeMarketplace`
 * would see every name in `initialNames` still present, exactly as it was before the
 * run — a static double that always answers "gone" could never catch that regression.
 */
class RegistryMirroringActivatorState implements HostMarketplaceRegistryReader {
  reads = 0;

  constructor(
    private readonly location: string,
    private readonly initialNames: readonly string[],
    private readonly activator: FakeNativePluginActivator
  ) {}

  async read(): Promise<HostMarketplaceRegistryReading> {
    this.reads += 1;
    const entries = new Map<string, string>();
    for (const name of this.initialNames) {
      if (!this.activator.removedMarketplaces.includes(name)) {
        entries.set(name, "/resolved/source");
      }
    }
    return { location: this.location, entries };
  }
}

function seedManifest(toolId: "claude" | "codex", hostName: string, alias: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool(toolId, "1.0.0", []);
  manifest.setNativeRegistrations(toolId, {
    binary: toolId,
    marketplaces: [{ alias, hostName }],
    pluginRefs: [REF],
  });
  return manifest;
}

function seedAiddMarketplaceRegistry(alias: string): InMemoryMarketplaceRegistry {
  const registry = new InMemoryMarketplaceRegistry();
  registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: alias,
      source: { kind: "local", path: "/some/built/path" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00.000Z",
    })
  );
  return registry;
}

function buildUseCase(deps: {
  fs: InMemoryFileAdapter;
  manifest: Manifest;
  activator: FakeNativePluginActivator;
  binary: string;
  logger: CapturingLogger;
  aiddMarketplaceRegistry: InMemoryMarketplaceRegistry;
  hostMarketplaceRegistries?: ReadonlyMap<AiToolId, HostMarketplaceRegistryReader>;
  homeDir?: () => string;
}): CleanUseCase {
  const manifestRepo = new InMemoryManifestRepository(deps.manifest, PROJECT_ROOT);
  return new CleanUseCase(
    deps.fs,
    manifestRepo,
    deps.logger,
    new GitignoreUseCase(deps.fs),
    new Map([[deps.binary, deps.activator]]),
    deps.aiddMarketplaceRegistry,
    undefined,
    deps.hostMarketplaceRegistries ?? new Map(),
    deps.homeDir
  );
}

describe("clean purges a host's own plugin cache", () => {
  it("purges claude's cache once undoing the registration actually frees the name", async () => {
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");
    await fs.writeFile(
      join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", ".orphaned_at"),
      "now"
    );

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [MARKETPLACE],
      activator
    );
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(false);
    expect(activator.removedMarketplaces).toContain(MARKETPLACE);
    expect(reader.reads).toBe(1);
  });

  it("leaves claude's cache in place, and names it, when the claude CLI is not on PATH", async () => {
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: false });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [MARKETPLACE],
      activator
    );
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(true);
    expect(reader.reads).toBe(0);
    // Not just that the cache survives — the output says where, the same absolute
    // path the dry-run preview would have announced, since `clean` never even gets
    // as far as `purgeNativeCaches` for this tool.
    expect(
      logger.warnMessages.some(
        (m) => m.includes("not on the PATH") && m.includes(join(CLAUDE_CACHE_ROOT, MARKETPLACE))
      )
    ).toBe(true);
  });

  it("leaves claude's cache in place when a fresh read still names it", async () => {
    // `removeMarketplace` throws (host refused, or the call failed for any other
    // reason `bestEffort` swallows), so the registry mirror never drops the name.
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true, throwOnRemove: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [MARKETPLACE],
      activator
    );
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(true);
    expect(reader.reads).toBe(1);
    expect(logger.warnMessages.some((m) => m.includes("still names it"))).toBe(true);
  });

  it("purges claude's cache when its registry does not exist at all", async () => {
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new FakeHostMarketplaceRegistryReader({
      location: "known_marketplaces.json",
      absent: true,
    });
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(false);
  });

  it("leaves claude's cache in place, and says so, when its registry could not be read", async () => {
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, MARKETPLACE, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new FakeHostMarketplaceRegistryReader({
      location: "known_marketplaces.json",
      unreadable: "EACCES",
    });
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(true);
    expect(
      logger.warnMessages.some(
        (m) =>
          m.includes("claude: plugin cache left in place, its registry could not be read") &&
          m.includes("known_marketplaces.json")
      )
    ).toBe(true);
  });

  it("purges the cache under the same HOME its own registry reader resolves its file from", async () => {
    // A sentinel, never this machine's real home: before the fix, `clean` composed its
    // cache root from `os.homedir()` directly, which ignores an injected `homeDir` and
    // would look for this cache under the *real* home instead of here, leaving it
    // behind and failing this assertion.
    const SENTINEL_HOME = "/sentinel-home-clean-cache-parity";
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(
      SENTINEL_HOME,
      ".claude",
      "plugins",
      "cache",
      MARKETPLACE,
      "plugin-a",
      "1.0.0",
      "plugin.json"
    );
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true });
    // The real adapter, resolved from the same sentinel `homeDir` below must also
    // compose its cache root from — a fake reader built independently of `homeDir`
    // could never catch the two halves drifting apart.
    const reader = hostMarketplaceRegistryReaders(SENTINEL_HOME).get("claude");
    if (reader === undefined) throw new Error("claude must declare marketplaceRegistry");

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
      homeDir: () => SENTINEL_HOME,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    // The real reader finds no known_marketplaces.json under a sentinel home that does
    // not exist on disk — absent, not unreadable — which purging proves it looked
    // under the very same sentinel `purgeNativeCaches` composed its cache root from.
    expect(await fs.fileExists(cacheEntry)).toBe(false);
  });

  it("refuses a '..' segment in a manifest's own hostName, never consulting the registry", async () => {
    const hostName = "../../../evil";
    const fs = new RecordingFileAdapter();
    const witness = join(CLAUDE_CACHE_ROOT, hostName);
    // Written down exactly where an unresolved join would land — proving the guard
    // catches the collapse `path.join` already performs, not a path this test invents.
    await fs.writeFile(join(witness, "keep-me.txt"), "still here");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [hostName],
      activator
    );
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", hostName, "safe-alias"),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry("safe-alias"),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(join(witness, "keep-me.txt"))).toBe(true);
    expect(fs.deletedDirectories).not.toContain(witness);
    expect(reader.reads).toBe(0);
    expect(logger.warnMessages.some((m) => m.includes("does not resolve inside"))).toBe(true);
  });

  it("refuses a cache entry that resolves outside the declared cache root through a symlink", async () => {
    const fs = new RecordingFileAdapter();
    const candidate = join(CLAUDE_CACHE_ROOT, MARKETPLACE);
    fs.setSymlink(candidate, "/outside/evil-target");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [MARKETPLACE],
      activator
    );
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.deletedDirectories).not.toContain(candidate);
    expect(logger.warnMessages.some((m) => m.includes("does not resolve inside"))).toBe(true);
  });

  it("keeps and names a cache path whose realpath fails with EACCES, without aborting the rest of clean", async () => {
    const candidate = join(CLAUDE_CACHE_ROOT, MARKETPLACE);
    const fs = new RealpathDeniedFileAdapter(candidate);
    const cacheEntry = join(candidate, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [MARKETPLACE],
      activator
    );
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "claude",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    // Kept: the EACCES'd cache is never removed.
    expect(await fs.fileExists(cacheEntry)).toBe(true);
    expect(logger.warnMessages.some((m) => m.includes(candidate))).toBe(true);
    // Never aborted mid-course: removeAiddState, well past the cache purge in
    // execute()'s own order, still ran.
    expect(fs.deletedDirectories).toContain(join(PROJECT_ROOT, AIDD_DIR, "cache"));
  });

  it("touches nothing under HOME for a tool whose profile declares no pluginCacheDir", async () => {
    const fs = new RecordingFileAdapter();
    const activator = new FakeNativePluginActivator({ available: true });
    const manifest = Manifest.create();
    manifest.addTool("copilot", "1.0.0", []);
    manifest.setNativeRegistrations("copilot", {
      binary: "copilot",
      marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
      pluginRefs: [REF],
    });
    const useCase = buildUseCase({
      fs,
      manifest,
      activator,
      binary: "copilot",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.deletedDirectories.some((p) => p.startsWith(HOME))).toBe(false);
  });

  it("purges under the catalog's own hostName, never the project's local alias", async () => {
    const alias = "my-local-alias";
    const hostName = "upstream-catalog-name";
    const fs = new RecordingFileAdapter();
    const cacheEntry = join(CLAUDE_CACHE_ROOT, hostName, "plugin-a", "1.0.0", "plugin.json");
    await fs.writeFile(cacheEntry, "{}");

    const activator = new FakeNativePluginActivator({ available: true });
    const reader = new RegistryMirroringActivatorState(
      "known_marketplaces.json",
      [hostName],
      activator
    );
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("claude", hostName, alias),
      activator,
      binary: "claude",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(alias),
      hostMarketplaceRegistries: new Map([["claude", reader]]),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(cacheEntry)).toBe(false);
    expect(fs.deletedDirectories).not.toContain(join(CLAUDE_CACHE_ROOT, alias));
  });

  it("purges codex's empty cache shell once its own CLI has removed the marketplace", async () => {
    // No reader registered for codex — its profile declares `pluginCacheDir` alone, no
    // `marketplaceRegistry`, so `purgeOneMarketplaceCache` proves emptiness instead.
    const fs = new RecordingFileAdapter();
    const activator = new FakeNativePluginActivator({ available: true });
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("codex", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "codex",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.deletedDirectories).toContain(join(CODEX_CACHE_ROOT, MARKETPLACE));
  });

  it("leaves codex's cache in place, even empty, when marketplace removal was not confirmed", async () => {
    // Nothing is written under the cache directory at all — empty, exactly the shape
    // `purgeCacheIfEmpty` reads as safe on its own — but `removeMarketplace` itself
    // throws, so this project never actually confirmed the host forgot the name.
    // Emptiness alone must not be read as proof it is safe to purge.
    const fs = new RecordingFileAdapter();

    const activator = new FakeNativePluginActivator({ available: true, throwOnRemove: true });
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("codex", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "codex",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.deletedDirectories).not.toContain(join(CODEX_CACHE_ROOT, MARKETPLACE));
    expect(logger.warnMessages.some((m) => m.includes("its own removal was not confirmed"))).toBe(
      true
    );
  });

  it("leaves codex's cache in place, and names it, when it still holds content", async () => {
    const fs = new RecordingFileAdapter();
    const leftover = join(CODEX_CACHE_ROOT, MARKETPLACE, "leftover.txt");
    await fs.writeFile(leftover, "still here");

    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const useCase = buildUseCase({
      fs,
      manifest: seedManifest("codex", MARKETPLACE, MARKETPLACE),
      activator,
      binary: "codex",
      logger,
      aiddMarketplaceRegistry: seedAiddMarketplaceRegistry(MARKETPLACE),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(await fs.fileExists(leftover)).toBe(true);
    expect(fs.deletedDirectories).not.toContain(join(CODEX_CACHE_ROOT, MARKETPLACE));
    expect(logger.warnMessages.some((m) => m.includes("still holds"))).toBe(true);
  });
});
