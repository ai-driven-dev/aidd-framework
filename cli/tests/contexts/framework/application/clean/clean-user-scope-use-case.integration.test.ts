import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { CleanUserScopeUseCase } from "../../../../../src/contexts/framework/application/clean/clean-user-scope-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { UserSourceReferencesAdapter } from "../../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import type { NativePluginActivator } from "../../../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import type { MarketplaceScope } from "../../../../../src/kernel/scope.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeHostMarketplaceRegistryReader } from "../../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const USER_CONFIG_DIR = "/fake-home/.config/aidd";
const HOME = "/fake-home";

/** Records every `deleteDirectory`/`deleteFile` call, in order, tagged with a label a
 * test can compare against another recorded event — the one way to prove an ordering
 * constraint holds without inspecting the use case's own private state. Pass a shared
 * array to correlate against another recorder (`RecordingActivator` below); defaults
 * to its own, for a test that only cares what this adapter itself saw. */
class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly order: string[];

  constructor(order: string[] = []) {
    super();
    this.order = order;
  }

  override async deleteDirectory(path: string): Promise<void> {
    this.order.push(`deleteDirectory:${path}`);
    return super.deleteDirectory(path);
  }

  override async deleteFile(path: string): Promise<void> {
    this.order.push(`deleteFile:${path}`);
    return super.deleteFile(path);
  }
}

/** A `NativePluginActivator` that pushes into the same shared `order` log the file
 * adapter above writes to — the only way to compare "the host was asked to forget
 * this marketplace" against "its cache directory was deleted" on one timeline. */
class RecordingActivator implements NativePluginActivator {
  readonly order: string[];
  readonly removedMarketplaces: string[] = [];
  readonly removedMarketplaceScopes: MarketplaceScope[] = [];
  readonly uninstalledPlugins: string[] = [];
  readonly uninstalledPluginScopes: MarketplaceScope[] = [];

  constructor(order: string[]) {
    this.order = order;
  }

  isAvailable(): boolean {
    return true;
  }
  addMarketplace(): void {}
  enablesPlugins(): boolean {
    return true;
  }
  removeMarketplace(name: string, scope: MarketplaceScope): void {
    this.order.push(`removeMarketplace:${name}`);
    this.removedMarketplaces.push(name);
    this.removedMarketplaceScopes.push(scope);
  }
  registrationState(): "live" | "dead" | "unknown" {
    return "unknown";
  }
  upgradeMarketplaces(): void {}
  enablePlugin(): void {}
  uninstallPlugin(pluginRef: string, scope: MarketplaceScope = "project"): void {
    this.order.push(`uninstallPlugin:${pluginRef}`);
    this.uninstalledPlugins.push(pluginRef);
    this.uninstalledPluginScopes.push(scope);
  }
}

/** A `Prompter` that records the last message it was asked to confirm and returns a
 * fixed answer — the only way to pin the confirmation's exact wording and prove the
 * "answered no" branch actually stops before anything is deleted. */
class RecordingPrompter implements Prompter {
  lastConfirmMessage: string | undefined;

  constructor(private readonly answer: boolean) {}

  async confirm(message: string): Promise<boolean> {
    this.lastConfirmMessage = message;
    return this.answer;
  }
  async resolveConflict(): Promise<"keep" | "overwrite"> {
    return "keep";
  }
  async resolveConflictBulk(): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "keep";
  }
  async input(): Promise<string> {
    return "";
  }
  async select<T>(): Promise<T> {
    throw new Error("not implemented");
  }
  async checkbox<T>(): Promise<T[]> {
    return [];
  }
}

function manifestWithClaude(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.setNativeRegistrations("claude", {
    binary: "claude",
    marketplaces: [{ alias: "aidd-framework", hostName: "aidd-framework" }],
    pluginRefs: ["aidd-context@aidd-framework"],
  });
  return manifest;
}

/** Seeds the cache path claude's own profile declares (`~/.claude/plugins/cache/<hostName>/`)
 * with a marker file, so `resolveCacheCandidate` finds something real to resolve and
 * purge — an empty/non-existent directory is silently skipped rather than purged. */
function seedClaudeCache(fs: InMemoryFileAdapter, hostName = "aidd-framework"): string {
  const cachePath = join(HOME, ".claude", "plugins", "cache", hostName);
  fs.setFile(join(cachePath, "marker.json"), "{}");
  return cachePath;
}

describe("clean --scope user", () => {
  describe("no user manifest, machine state from a project-scope setup", () => {
    it("still purges the whitelist and touches no host, naming the referencing projects", async () => {
      const order: string[] = [];
      const fs = new RecordingFileAdapter(order);
      fs.setFile(
        join(USER_CONFIG_DIR, "cache", "built", "1.0.0", "aidd-framework", "claude", "x"),
        "1"
      );
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        "/wherever",
        Marketplace.create({
          name: FRAMEWORK_MARKETPLACE_NAME,
          source: { kind: "local", path: "/src/framework" },
          scope: "user",
          addedAt: "2026-01-01T00:00:00Z",
        })
      );
      const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
      await userSourceReferences.addReference("1.0.0", "/project-a");
      fs.setFile("/project-a/marker", "");
      const activator = new RecordingActivator(order);
      const logger = new CapturingLogger();
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(null),
        logger,
        registry,
        () => USER_CONFIG_DIR,
        new Map([["claude", activator]]),
        new Map(),
        () => HOME,
        userSourceReferences
      );

      const result = await useCase.execute({ projectRoot: "/wherever", force: true });

      expect(result.manifestFound).toBe(false);
      // The whitelist purge runs regardless of the manifest — it reads nothing from it.
      expect(fs.order).toContain(`deleteDirectory:${join(USER_CONFIG_DIR, "cache", "built")}`);
      // No manifest means no `nativeRegistrations` to drive a host's own CLI through —
      // the activator that would have recorded a real call never sees one.
      expect(activator.removedMarketplaces).toEqual([]);
      expect(activator.uninstalledPlugins).toEqual([]);
      const info = logger.infoMessages.find((m) => m.includes("No host registration"));
      expect(info).toBeDefined();
      expect(info).toContain("/project-a");
      // Lot 9, item D2: names both removal commands, in order — dropping the
      // per-project `aidd clean` half (leaving only `aidd clean --scope user`) must
      // fail this, not just a bare `.toContain("aidd clean")`, which that longer
      // command also satisfies as a substring.
      expect(info).toContain("`aidd clean`");
      expect(info).toContain("`aidd clean --scope user`");
      expect(info?.indexOf("`aidd clean`")).toBeLessThan(
        info?.indexOf("`aidd clean --scope user`") ?? -1
      );
    });
  });

  describe("order", () => {
    it("unregisters the marketplace through the host CLI before purging its cache", async () => {
      const order: string[] = [];
      const fs = new RecordingFileAdapter(order);
      seedClaudeCache(fs);
      const activator = new RecordingActivator(order);
      const manifestRepo = new InMemoryManifestRepository(manifestWithClaude());
      const useCase = new CleanUserScopeUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map([["claude", activator]]),
        new Map([
          [
            "claude",
            new FakeHostMarketplaceRegistryReader({
              location: "known_marketplaces.json",
              entries: new Map(),
            }),
          ],
        ]),
        () => HOME
      );

      await useCase.execute({ projectRoot: "/wherever", force: true });

      const removeIndex = order.indexOf("removeMarketplace:aidd-framework");
      const purgeIndex = order.findIndex((entry) => entry.startsWith("deleteDirectory:"));
      expect(removeIndex).toBeGreaterThanOrEqual(0);
      expect(purgeIndex).toBeGreaterThanOrEqual(0);
      expect(removeIndex).toBeLessThan(purgeIndex);
    });
  });

  describe("whitelist", () => {
    it("deletes exactly cache/built, manifest.json, references.json and the aidd-framework marketplaces.json entry — nothing else", async () => {
      const fs = new RecordingFileAdapter();
      fs.setFile(
        join(USER_CONFIG_DIR, "cache", "built", "1.0.0", "aidd-framework", "claude", "x"),
        "1"
      );
      const manifestRepo = new InMemoryManifestRepository(Manifest.create());
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        "/wherever",
        Marketplace.create({
          name: FRAMEWORK_MARKETPLACE_NAME,
          source: { kind: "local", path: "/src/framework" },
          scope: "user",
          addedAt: "2026-01-01T00:00:00Z",
        })
      );
      await registry.save(
        "/wherever",
        Marketplace.create({
          name: "other-marketplace",
          source: { kind: "local", path: "/src/other" },
          scope: "user",
          addedAt: "2026-01-01T00:00:00Z",
        })
      );
      const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
      await userSourceReferences.addReference("1.0.0", "/project-a");
      fs.setFile("/project-a/marker", "");
      const useCase = new CleanUserScopeUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        registry,
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        userSourceReferences
      );

      await useCase.execute({ projectRoot: "/wherever", force: true });

      expect(fs.order).toContain(`deleteDirectory:${join(USER_CONFIG_DIR, "cache", "built")}`);
      expect(fs.order).toContain(`deleteFile:${join(USER_CONFIG_DIR, "references.json")}`);
      expect(manifestRepo.getCurrent()).toBeNull();
      const remaining = registry.getAll("/wherever").map((m) => m.name);
      expect(remaining).not.toContain(FRAMEWORK_MARKETPLACE_NAME);
      expect(remaining).toContain("other-marketplace");
    });

    it("never deletes userConfigDir() itself, even when references.json resolves back to it through a symlink", async () => {
      const fs = new RecordingFileAdapter();
      fs.setFile(join(USER_CONFIG_DIR, "marker"), "1");
      // A corrupted or attacker-controlled state: the references file has become a
      // symlink pointing straight back at userConfigDir() itself.
      fs.setSymlink(join(USER_CONFIG_DIR, "references.json"), USER_CONFIG_DIR);
      const logger = new CapturingLogger();
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(Manifest.create()),
        logger,
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR
      );

      await useCase.execute({ projectRoot: "/wherever", force: true });

      // references.json's own candidate resolves straight back to userConfigDir()
      // itself, which containment refuses regardless of equality — never `deleteFile`d,
      // under its own name or a literal unresolved one.
      expect(fs.order).not.toContain(`deleteFile:${join(USER_CONFIG_DIR, "references.json")}`);
      expect(fs.order).not.toContain(`deleteFile:${USER_CONFIG_DIR}`);
      expect(fs.order.some((entry) => entry.endsWith(USER_CONFIG_DIR))).toBe(false);
      // userConfigDir() itself must still exist — the marker file placed directly under it
      // proves the directory was never recursively removed.
      expect(await fs.fileExists(join(USER_CONFIG_DIR, "marker"))).toBe(true);
    });

    it("leaves a cursor plugin file in place when it resolves outside the user plugins boundary through a symlink", async () => {
      const fs = new RecordingFileAdapter();
      const boundary = join(HOME, ".cursor", "plugins", "local");
      // A sibling directory sharing `boundary`'s own name as a string *prefix* —
      // `${boundary}-evil` — not a path under it. A raw `candidate.startsWith(boundary)`
      // check (the mutation this test guards against) would wrongly call this
      // contained; only `relative()`-based containment sees the leading `..`.
      const escapeTarget = `${boundary}-evil`;
      fs.setFile(join(escapeTarget, "evil.md"), "danger");
      // The manifest's own entry names a plugin directory that, since install, became a
      // symlink escaping the declared user-scope boundary.
      fs.setSymlink(join(boundary, "rogue-plugin"), escapeTarget);
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromMetadata(
          "rogue-plugin",
          "1.0.0",
          { kind: "local", path: "/whatever" },
          false,
          "user"
        ).withFiles(new Map([["rogue-plugin/evil.md", "hash"]]))
      );
      const logger = new CapturingLogger();
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(manifest),
        logger,
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME
      );

      await useCase.execute({ projectRoot: "/wherever", force: true });

      expect(await fs.fileExists(join(escapeTarget, "evil.md"))).toBe(true);
      expect(logger.warnMessages.some((m) => m.includes("does not resolve inside"))).toBe(true);
    });
  });

  describe("binary absent", () => {
    it("names the binary and what it would have undone, without touching its own cache", async () => {
      const fs = new RecordingFileAdapter();
      const claudeCachePath = seedClaudeCache(fs);
      const logger = new CapturingLogger();
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(manifestWithClaude()),
        logger,
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(), // no activator registered for "claude" — the binary is absent
        new Map(),
        () => HOME
      );

      await useCase.execute({ projectRoot: "/wherever", force: true });

      const warning = logger.warnMessages.find(
        (m) => m.includes("claude") && m.includes("not on the PATH")
      );
      expect(warning).toBeDefined();
      expect(warning).toContain("1 marketplace(s)");
      expect(warning).toContain("1 plugin ref(s)");
      expect(warning).toContain(claudeCachePath);
      // The whitelist step still purges userConfigDir()'s own cache/built/, unrelated
      // to this host's own cache — only claude's own directory must survive untouched.
      expect(fs.order).not.toContain(`deleteDirectory:${claudeCachePath}`);
      expect(await fs.fileExists(join(claudeCachePath, "marker.json"))).toBe(true);
    });
  });

  describe("confirmation", () => {
    it("names the versions built and the projects still referencing the source", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(
        join(USER_CONFIG_DIR, "cache", "built", "1.2.3", "aidd-framework", "claude", "x"),
        "1"
      );
      fs.setFile("/project-a/marker", "");
      const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
      await userSourceReferences.addReference("1.2.3", "/project-a");
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(Manifest.create()),
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        userSourceReferences
      );

      const result = await useCase.execute({ projectRoot: "/wherever", force: false });

      expect(result.dryRun).toBe(true);
      expect(result.preview.builtVersions).toEqual(["1.2.3"]);
      expect(result.preview.referencingProjects).toEqual(["/project-a"]);
    });

    it("ignores a referencing project whose own path no longer exists", async () => {
      const fs = new InMemoryFileAdapter();
      const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
      await userSourceReferences.addReference("1.0.0", "/gone");
      const useCase = new CleanUserScopeUseCase(
        fs,
        new InMemoryManifestRepository(Manifest.create()),
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        userSourceReferences
      );

      const result = await useCase.execute({ projectRoot: "/wherever", force: false });

      expect(result.preview.referencingProjects).toEqual([]);
    });

    it("--force skips confirmation and proceeds even when projects still reference it", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile("/project-a/marker", "");
      const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
      await userSourceReferences.addReference("1.0.0", "/project-a");
      const manifestRepo = new InMemoryManifestRepository(Manifest.create());
      const useCase = new CleanUserScopeUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        userSourceReferences
      );

      const result = await useCase.execute({ projectRoot: "/wherever", force: true });

      expect(result.dryRun).toBe(false);
      expect(manifestRepo.getCurrent()).toBeNull();
    });
  });

  describe("confirmation prompt", () => {
    it("proceeds and purges once the interactive prompt is answered yes, pinning its wording", async () => {
      const fs = new RecordingFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(Manifest.create());
      const prompter = new RecordingPrompter(true);
      const useCase = new CleanUserScopeUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        undefined,
        prompter
      );

      const result = await useCase.execute({
        projectRoot: "/wherever",
        force: false,
        interactive: true,
      });

      expect(prompter.lastConfirmMessage).toBe(
        "Remove the shared 'aidd-framework' source for this machine " +
          "(versions: none built yet)? Still referenced by: no other project."
      );
      expect(result.dryRun).toBe(false);
      expect(manifestRepo.getCurrent()).toBeNull();
    });

    it("does nothing once the interactive prompt is answered no", async () => {
      const fs = new RecordingFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(Manifest.create());
      const prompter = new RecordingPrompter(false);
      const useCase = new CleanUserScopeUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new InMemoryMarketplaceRegistry(),
        () => USER_CONFIG_DIR,
        new Map(),
        new Map(),
        () => HOME,
        undefined,
        prompter
      );

      const result = await useCase.execute({
        projectRoot: "/wherever",
        force: false,
        interactive: true,
      });

      expect(result.dryRun).toBe(true);
      expect(manifestRepo.getCurrent()).not.toBeNull();
      expect(fs.order).toEqual([]);
    });
  });
});
