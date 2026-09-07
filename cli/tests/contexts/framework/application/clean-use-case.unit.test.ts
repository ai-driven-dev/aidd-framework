import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { CleanUseCase } from "../../../../src/contexts/framework/application/clean-use-case.js";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { UserSourceReferencesAdapter } from "../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { cursorProjectHooksScriptDir } from "../../../../src/contexts/tools/domain/formats/cursor-hooks-project-merge.js";
import type { NativePluginActivator } from "../../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import type { AiToolId, ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { FakeHostPluginRegistryReader } from "../../../helpers/ports/fake-host-plugin-registry-reader.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";

/** Records every path `deleteFile` is called with, so a test can prove where a plugin's
 * file actually got deleted from without inspecting private use-case state. */
class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly deletedPaths: string[] = [];

  override async deleteFile(path: string): Promise<void> {
    this.deletedPaths.push(path);
    return super.deleteFile(path);
  }
}

// Cursor Mode B: file key is base-relative (no absolute prefix, relative to the
// resolved user plugins dir) — same shape as status-plugin-user-scope.unit.test.ts.
const PLUGIN_KEY = "aidd-context/commands/hello.md";

describe("clean", () => {
  it("with force removes .aidd/cache/ entry from .gitignore", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n.aidd/cache/\ndist/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).not.toContain(".aidd/cache/");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("with force removes aidd_docs/runs/ entry from .gitignore, same as the pipeline adds", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n.aidd/cache/\naidd_docs/runs/\ndist/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).not.toContain(".aidd/cache/");
    expect(content).not.toContain("aidd_docs/runs/");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("with force leaves .gitignore unchanged when entry absent", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).toBe("node_modules/\n");
  });

  it("preserves untracked user files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const userFile = join(PROJECT_ROOT, "my-custom-file.txt");
    await deps.fs.writeFile(userFile, "user content");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(userFile)).toBe(true);
  });

  it("keeps .aidd/config.json and deletes .aidd/cache/ when config.json exists", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const configPath = join(PROJECT_ROOT, ".aidd", "config.json");
    const cacheFile = join(PROJECT_ROOT, ".aidd", "cache", "built", "leftover.json");
    await deps.fs.writeFile(configPath, '{"telemetry":{"enabled":true}}');
    await deps.fs.writeFile(cacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(configPath)).toBe(true);
    expect(deps.fs.has(cacheFile)).toBe(false);
    expect(deps.manifestRepo.getCurrent()).toBeNull();
  });

  it("removes .aidd/plugin-cache/, which no install writes but plugin add does", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const pluginCacheFile = join(PROJECT_ROOT, ".aidd", "plugin-cache", "some-plugin", "x.json");
    await deps.fs.writeFile(pluginCacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(pluginCacheFile)).toBe(false);
    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });

  it("removes .aidd/ entirely when nothing but the manifest and cache lived there", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const cacheFile = join(PROJECT_ROOT, ".aidd", "cache", "built", "leftover.json");
    await deps.fs.writeFile(cacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });
  it("removes the marketplaces this project registered, which `marketplace add` wrote", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // Written by `marketplace add`, not by an install — so it survived a clean that removed
    // only the caches and the manifest, and its presence kept `.aidd/` alive with it.
    const registry = join(PROJECT_ROOT, ".aidd", "marketplaces.json");
    await deps.fs.writeFile(registry, JSON.stringify({ version: 1, marketplaces: [] }));

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(registry)).toBe(false);
    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });

  it("removes the registry and still keeps config.json, when a project has both", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // The interaction the two rules meet in: one file clean wrote and must take back, one it
    // never wrote and must leave. Each proven alone says nothing about the pair.
    const config = join(PROJECT_ROOT, ".aidd", "config.json");
    const registry = join(PROJECT_ROOT, ".aidd", "marketplaces.json");
    await deps.fs.writeFile(config, JSON.stringify({ telemetry: { enabled: true } }));
    await deps.fs.writeFile(registry, JSON.stringify({ version: 1, marketplaces: [] }));

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(registry)).toBe(false);
    expect(deps.fs.has(config)).toBe(true);
  });

  it("deletes a user-scope (cursor) plugin's file from its resolved home directory, not projectRoot", async () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name: "aidd-context",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { [PLUGIN_KEY]: "abc123abc123abc123abc123abc123ab" },
        scope: "user",
      })
    );

    const fs = new RecordingFileAdapter();
    const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
    const useCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(
      fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", PLUGIN_KEY)))
    ).toBe(true);
    expect(fs.deletedPaths).not.toContain(join(PROJECT_ROOT, PLUGIN_KEY));
  });

  it("deletes a cursor plugin's file under projectRoot, not ~/.cursor/plugins/local, when the manifest says scope: project", async () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name: "aidd-context",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { [PLUGIN_KEY]: "abc123abc123abc123abc123abc123ab" },
        // Disagrees with cursor's own profile, which declares installScope "user".
        scope: "project",
      })
    );

    const fs = new RecordingFileAdapter();
    const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
    const useCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.deletedPaths).toContain(join(PROJECT_ROOT, PLUGIN_KEY));
    expect(fs.deletedPaths.some((p) => p.includes(join(".cursor", "plugins", "local")))).toBe(
      false
    );
  });

  describe("undoing a host's own native registration", () => {
    const BINARY = "codex";
    const MARKETPLACE = "aidd-framework";
    const REF = "aidd-context@aidd-framework";

    function seedManifestWithNativeRegistrations(): Manifest {
      const manifest = Manifest.create();
      manifest.addTool("codex", "1.0.0", []);
      manifest.setNativeRegistrations("codex", {
        binary: BINARY,
        marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
        pluginRefs: [REF],
      });
      return manifest;
    }

    function seedMarketplaceRegistry(): InMemoryMarketplaceRegistry {
      const registry = new InMemoryMarketplaceRegistry();
      registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: MARKETPLACE,
          source: { kind: "local", path: "/some/built/path" },
          scope: "project",
          addedAt: "2026-01-01T00:00:00.000Z",
        })
      );
      return registry;
    }

    it("uninstalls the registered plugin ref and removes the marketplace it came from", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const activator = new FakeNativePluginActivator({ available: true });
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        seedMarketplaceRegistry()
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(activator.uninstalledPlugins).toEqual([REF]);
      expect(activator.removedMarketplaces).toEqual([MARKETPLACE]);
    });

    it("leaves a machine-scope marketplace registered — every other project on this machine shares it — while still uninstalling this project's own plugin ref", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const activator = new FakeNativePluginActivator({ available: true });
      const registry = new InMemoryMarketplaceRegistry();
      registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: MARKETPLACE,
          source: { kind: "local", path: "/shared/built/path" },
          scope: "user",
          addedAt: "2026-01-01T00:00:00.000Z",
        })
      );
      const logger = new CapturingLogger();
      const HOME = "/fake-home";
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        logger,
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        registry,
        undefined,
        new Map(),
        () => HOME
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(activator.uninstalledPlugins).toEqual([REF]);
      expect(activator.removedMarketplaces).toEqual([]);
      // Bloquant/dette 9: the message used to name only one of the three things that
      // actually survive — the host's own registration. `userConfigDir()/marketplaces.json`
      // (the entry `MarketplaceRegisterFrameworkUseCase` wrote) and the tool's own
      // plugin cache both survive it too, and neither was named.
      const message = logger.warnMessages.find(
        (m) => m.includes(MARKETPLACE) && m.includes("shared by every project")
      );
      expect(message).toBeDefined();
      expect(message).toContain("userConfigDir()/marketplaces.json");
      expect(message).toContain(join(HOME, ".codex", "plugins", "cache", MARKETPLACE));
    });

    describe("uninstalling at the scope a plugin was actually registered at", () => {
      const CLAUDE_BINARY = "claude";
      const CLAUDE_MARKETPLACE = "aidd-framework";
      const CLAUDE_REF = "aidd-context@aidd-framework";

      function seedClaudeManifest(pluginScope: "project" | "user"): Manifest {
        const manifest = Manifest.create();
        manifest.addTool("claude", "1.0.0", []);
        manifest.addPlugin(
          "claude",
          InstalledPlugin.fromMetadata(
            "aidd-context",
            "1.0.0",
            { kind: "github", repo: "ai-driven-dev/framework" },
            true,
            pluginScope,
            CLAUDE_MARKETPLACE
          )
        );
        manifest.setNativeRegistrations("claude", {
          binary: CLAUDE_BINARY,
          marketplaces: [{ alias: CLAUDE_MARKETPLACE, hostName: CLAUDE_MARKETPLACE }],
          pluginRefs: [CLAUDE_REF],
        });
        return manifest;
      }

      function seedClaudeMarketplaceRegistry(): InMemoryMarketplaceRegistry {
        const registry = new InMemoryMarketplaceRegistry();
        registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: CLAUDE_MARKETPLACE,
            source: { kind: "local", path: "/some/built/path" },
            scope: "project",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        return registry;
      }

      // The regression itself: before scope threading existed, `enablePlugin` carried
      // no scope argument at all, so a real `claude` binary always registered at its
      // own implicit default, `"user"`, regardless of what the manifest recorded for
      // the plugin's own files (`"project"`, since claude's files always install to
      // the project). `clean`'s default-scope uninstall used to try `"project"` only,
      // which a real `claude` binary refuses outright for an entry registered at a
      // different scope — the plugin survived every `clean` run silently.
      it("falls back to the other scope when the manifest's own scope does not match what was actually registered, with no host registry to ask", async () => {
        const manifest = seedClaudeManifest("project");
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({
          available: true,
          installedAtScope: new Map([[CLAUDE_REF, "user"]]),
        });
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          new CapturingLogger(),
          new GitignoreUseCase(fs),
          new Map([[CLAUDE_BINARY, activator]]),
          seedClaudeMarketplaceRegistry()
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(activator.uninstalledPlugins).toEqual([CLAUDE_REF]);
        expect(activator.uninstalledPluginScopes).toEqual(["project", "user"]);
      });

      it("uninstalls at the scope the host's own registry names directly, one attempt, when it answers for this ref", async () => {
        const manifest = seedClaudeManifest("project");
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({
          available: true,
          installedAtScope: new Map([[CLAUDE_REF, "user"]]),
        });
        const hostPluginRegistries = new Map<AiToolId, FakeHostPluginRegistryReader>([
          [
            "claude",
            new FakeHostPluginRegistryReader({
              location: "/registry",
              refs: new Map([[CLAUDE_REF, { enabled: true, scope: "user" }]]),
            }),
          ],
        ]);
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          new CapturingLogger(),
          new GitignoreUseCase(fs),
          new Map([[CLAUDE_BINARY, activator]]),
          seedClaudeMarketplaceRegistry(),
          undefined,
          new Map(),
          undefined,
          undefined,
          hostPluginRegistries
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(activator.uninstalledPlugins).toEqual([CLAUDE_REF]);
        expect(activator.uninstalledPluginScopes).toEqual(["user"]);
      });
    });

    describe("this project's own reference to the shared source", () => {
      const OTHER_PROJECT_ROOT = "/other-project";

      function seedReferences(
        fs: InMemoryFileAdapter,
        projectRoots: readonly string[]
      ): UserSourceReferencesAdapter {
        for (const root of projectRoots) fs.setFile(join(root, "marker"), "");
        return new UserSourceReferencesAdapter(fs, () => "/fake-home/.config/aidd");
      }

      it("drops its own claim but leaves the shared marketplace registered — the other project still sees it", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const userSourceReferences = seedReferences(fs, [PROJECT_ROOT, OTHER_PROJECT_ROOT]);
        await userSourceReferences.addReference("1.0.0", PROJECT_ROOT);
        await userSourceReferences.addReference("1.0.0", OTHER_PROJECT_ROOT);
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          new CapturingLogger(),
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        // The host-side guard already in place: the shared marketplace is never
        // unregistered from claude/codex/copilot by a single project's own `clean`.
        expect(activator.removedMarketplaces).toEqual([]);
        // The project-side bookkeeping this lot adds: only this project's own claim
        // is dropped, and the other project — reading the very same registry — still
        // finds the marketplace registered.
        expect(await userSourceReferences.countReferencesForProject(OTHER_PROJECT_ROOT)).toBe(1);
        expect((await registry.list(OTHER_PROJECT_ROOT)).map((m) => m.name)).toContain(MARKETPLACE);
      });

      it("names how many other projects still reference the source", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const userSourceReferences = seedReferences(fs, [PROJECT_ROOT, OTHER_PROJECT_ROOT]);
        await userSourceReferences.addReference("1.0.0", PROJECT_ROOT);
        await userSourceReferences.addReference("1.0.0", OTHER_PROJECT_ROOT);
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        const message = logger.warnMessages.find((m) => m.includes("shared by every project"));
        expect(message).toBeDefined();
        expect(message).toContain("Still referenced by 1 other project on this machine.");
      });

      // Decision 4: the singular case above pins "1 other project"; nothing pinned the
      // plural until now, and a verb-agreement bug hides exactly there ("2 ... reference"
      // reads fine only because English rarely conjugates a plural verb visibly — the
      // passive phrasing sidesteps the question for either count).
      it("names the plural correctly when more than one other project still references the source", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const THIRD_PROJECT_ROOT = "/third-project";
        const userSourceReferences = seedReferences(fs, [
          PROJECT_ROOT,
          OTHER_PROJECT_ROOT,
          THIRD_PROJECT_ROOT,
        ]);
        await userSourceReferences.addReference("1.0.0", PROJECT_ROOT);
        await userSourceReferences.addReference("1.0.0", OTHER_PROJECT_ROOT);
        await userSourceReferences.addReference("1.0.0", THIRD_PROJECT_ROOT);
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        const message = logger.warnMessages.find((m) => m.includes("shared by every project"));
        expect(message).toBeDefined();
        expect(message).toContain("Still referenced by 2 other projects on this machine.");
      });

      it("names that nothing removes the source yet once this was the last reference", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const userSourceReferences = seedReferences(fs, [PROJECT_ROOT]);
        await userSourceReferences.addReference("1.0.0", PROJECT_ROOT);
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        const message = logger.warnMessages.find((m) => m.includes("shared by every project"));
        expect(message).toBeDefined();
        expect(message).toContain("No project on this machine still references it");
        expect(message).toContain("aidd clean");
        expect(await userSourceReferences.countReferencesForProject(PROJECT_ROOT)).toBeUndefined();
      });

      it("names the still-live reference count in a dry-run, without dropping anything", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const userSourceReferences = seedReferences(fs, [PROJECT_ROOT, OTHER_PROJECT_ROOT]);
        await userSourceReferences.addReference("1.0.0", PROJECT_ROOT);
        await userSourceReferences.addReference("1.0.0", OTHER_PROJECT_ROOT);
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          new CapturingLogger(),
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

        expect(result.dryRun).toBe(true);
        expect(result.preview.sharedSourceReferenceCount).toBe(2);
        // A dry-run must never write: both projects still hold their reference.
        expect(await userSourceReferences.countReferencesForProject(PROJECT_ROOT)).toBe(2);
      });

      // Bloquant found in review: `clean` used to ask a `VersionReader` for "the current
      // CLI version" and decrement that key — wrong whenever the running binary has
      // self-updated since the `sync` that wrote the reference (the ordinary case, not
      // an edge case), since the reference sits under the *older* version it was
      // recorded at. `CleanUseCase` no longer has a version reader to ask at all: this
      // seeds the reference under an old build's version key with no "current version"
      // wired in anywhere, and proves `clean` still finds and drops it.
      it("drops this project's reference even though it was recorded under an older CLI version", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const userSourceReferences = seedReferences(fs, [PROJECT_ROOT, OTHER_PROJECT_ROOT]);
        // Both projects registered while the CLI was still at 0.9.0 — the machine may
        // since have self-updated any number of times, and this use case has no way
        // to know or care what version is "current" today.
        await userSourceReferences.addReference("0.9.0", PROJECT_ROOT);
        await userSourceReferences.addReference("0.9.0", OTHER_PROJECT_ROOT);
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(await userSourceReferences.countReferencesForProject(PROJECT_ROOT)).toBeUndefined();
        expect(await userSourceReferences.countReferencesForProject(OTHER_PROJECT_ROOT)).toBe(1);
        const message = logger.warnMessages.find((m) => m.includes("shared by every project"));
        expect(message).toBeDefined();
        expect(message).toContain("Still referenced by 1 other project on this machine.");
      });

      // Bloquant found in review: `references.json` is a help, not an authority — a
      // corrupted copy must never block the destructive command that does not depend
      // on it. Before the guard, both the dry-run preview and the `--force` drop threw
      // `UnreadableUserSourceReferencesError` straight out of `execute`.
      it("warns and still previews a dry-run when references.json is corrupted", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        fs.setFile("/fake-home/.config/aidd/references.json", "not json");
        const userSourceReferences = new UserSourceReferencesAdapter(
          fs,
          () => "/fake-home/.config/aidd"
        );
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

        expect(result.dryRun).toBe(true);
        expect(result.preview.sharedSourceReferenceCount).toBeUndefined();
        expect(logger.warnMessages.some((m) => m.includes("references.json"))).toBe(true);
      });

      it("warns and still drops the rest when --force runs against a corrupted references.json", async () => {
        const manifest = seedManifestWithNativeRegistrations();
        const fs = new InMemoryFileAdapter();
        const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: MARKETPLACE,
            source: { kind: "local", path: "/shared/built/path" },
            scope: "user",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        fs.setFile("/fake-home/.config/aidd/references.json", "not json");
        const userSourceReferences = new UserSourceReferencesAdapter(
          fs,
          () => "/fake-home/.config/aidd"
        );
        const logger = new CapturingLogger();
        const useCase = new CleanUseCase(
          fs,
          manifestRepo,
          logger,
          new GitignoreUseCase(fs),
          new Map([[BINARY, activator]]),
          registry,
          undefined,
          new Map(),
          () => "/fake-home",
          userSourceReferences
        );

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(result.dryRun).toBe(false);
        expect(logger.warnMessages.some((m) => m.includes("references.json"))).toBe(true);
      });
    });

    it("warns and leaves the registration in place when the tool's CLI is not on PATH", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const activator = new FakeNativePluginActivator({ available: false });
      const logger = new CapturingLogger();
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        logger,
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        seedMarketplaceRegistry()
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(activator.uninstalledPlugins).toEqual([]);
      expect(activator.removedMarketplaces).toEqual([]);
      // The cache `purgeNativeCaches` never even gets to consider — this tool's
      // absent binary means `undone` never carries it — must still be named, the
      // same absolute path the dry-run preview would have announced.
      const survivingCache = join(homedir(), ".codex", "plugins", "cache", MARKETPLACE);
      expect(
        logger.warnMessages.some(
          (m) =>
            m.startsWith("codex: registration left in place, the codex CLI is not on the PATH.") &&
            m.includes(survivingCache)
        )
      ).toBe(true);
    });

    it("uninstalls the plugin ref before removing the marketplace, for the same tool", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const calls: string[] = [];
      const activator = new OrderRecordingActivator(calls);
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        seedMarketplaceRegistry()
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(calls).toEqual([`uninstall:${REF}`, `removeMarketplace:${MARKETPLACE}`]);
    });

    it("undoes the native registration before the built marketplace tree it points at is deleted", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const builtPath = join(
        PROJECT_ROOT,
        ".aidd",
        "cache",
        "built",
        MARKETPLACE,
        BINARY,
        "x.json"
      );
      await fs.writeFile(builtPath, "{}");
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      let builtTreeExistedAtRemoveMarketplace: boolean | null = null;
      const activator = new AssertingActivator(async () => {
        builtTreeExistedAtRemoveMarketplace = fs.has(builtPath);
      });
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        seedMarketplaceRegistry()
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(builtTreeExistedAtRemoveMarketplace).toBe(true);
    });

    it("names the native registration a dry-run preview will undo, without touching it", async () => {
      const manifest = seedManifestWithNativeRegistrations();
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const activator = new FakeNativePluginActivator({ available: true });
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        seedMarketplaceRegistry()
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(result.dryRun).toBe(true);
      expect(result.preview.nativeRegistrations).toEqual([
        {
          toolId: "codex",
          binary: BINARY,
          marketplaceCount: 1,
          pluginRefCount: 1,
          cachePaths: [join(homedir(), ".codex", "plugins", "cache", MARKETPLACE)],
        },
      ]);
      expect(activator.uninstalledPlugins).toEqual([]);
      expect(activator.removedMarketplaces).toEqual([]);
    });

    it("removes the marketplace under its catalog's own host name, not this project's local alias for it", async () => {
      const ALIAS = "userscoped";
      const HOST_NAME = "user-mkt";
      const manifest = Manifest.create();
      manifest.addTool("codex", "1.0.0", []);
      manifest.setNativeRegistrations("codex", {
        binary: BINARY,
        marketplaces: [{ alias: ALIAS, hostName: HOST_NAME }],
        pluginRefs: [],
      });
      const fs = new InMemoryFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const activator = new FakeNativePluginActivator({ available: true });
      const registry = new InMemoryMarketplaceRegistry();
      registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: ALIAS,
          source: { kind: "local", path: "/some/built/path" },
          scope: "project",
          addedAt: "2026-01-01T00:00:00.000Z",
        })
      );
      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map([[BINARY, activator]]),
        registry
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(activator.removedMarketplaces).toEqual([HOST_NAME]);
      expect(activator.removedMarketplaces).not.toContain(ALIAS);
    });
  });

  describe("machine-local files a tool's own materialization writes outside the manifest", () => {
    it("removes .claude/settings.local.json, which install writes but the manifest never tracks", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);
      const settingsLocalPath = join(PROJECT_ROOT, ".claude", "settings.local.json");
      await deps.fs.writeFile(settingsLocalPath, "{}");

      const useCase = new CleanUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.gitignoreUseCase
      );
      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(deps.fs.has(settingsLocalPath)).toBe(false);
    });

    it("deletes .cursor/hooks.json entirely once unmerging leaves it empty, and its script directory", async () => {
      const pluginName = "aidd-context";
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: pluginName,
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: {},
          scope: "project",
        })
      );
      const fs = new InMemoryFileAdapter();
      const hooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
      const scriptMarker = cursorProjectHooksScriptDir(pluginName);
      await fs.writeFile(
        hooksPath,
        JSON.stringify({
          version: 1,
          hooks: { PreToolUse: [{ command: `./${scriptMarker}run.js` }] },
        })
      );
      const scriptPath = join(PROJECT_ROOT, scriptMarker, "run.js");
      await fs.writeFile(scriptPath, "// hook script");
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);

      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );
      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(fs.has(hooksPath)).toBe(false);
      expect(fs.has(scriptPath)).toBe(false);
    });

    it("keeps .cursor/hooks.json when another plugin's entries remain in it", async () => {
      const pluginName = "aidd-context";
      const otherPluginName = "aidd-dev";
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: pluginName,
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: {},
          scope: "project",
        })
      );
      const fs = new InMemoryFileAdapter();
      const hooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
      const scriptMarker = cursorProjectHooksScriptDir(pluginName);
      const otherScriptMarker = cursorProjectHooksScriptDir(otherPluginName);
      await fs.writeFile(
        hooksPath,
        JSON.stringify({
          version: 1,
          hooks: {
            PreToolUse: [
              { command: `./${scriptMarker}run.js` },
              { command: `./${otherScriptMarker}run.js` },
            ],
          },
        })
      );
      const otherScriptPath = join(PROJECT_ROOT, otherScriptMarker, "run.js");
      await fs.writeFile(
        otherScriptPath,
        "// hook script belonging to a plugin clean never tracked"
      );
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);

      const useCase = new CleanUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );
      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      const remainingHooks = fs.getFile(hooksPath);
      expect(remainingHooks).toBeDefined();
      expect(remainingHooks).not.toContain(scriptMarker);
      expect(remainingHooks).toContain(otherScriptMarker);
      expect(fs.has(otherScriptPath)).toBe(true);
    });
  });

  describe("user-scope containment for a plugin's own files", () => {
    it("refuses to delete a manifest entry whose relative path escapes the user-scope directory via `..`, while still deleting its legitimate sibling", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: {
            [PLUGIN_KEY]: "abc123abc123abc123abc123abc123ab",
            "../../../.ssh/id_rsa": "def456def456def456def456def456de",
          },
          scope: "user",
        })
      );
      const fs = new RecordingFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const logger = new CapturingLogger();
      const useCase = new CleanUseCase(fs, manifestRepo, logger, new GitignoreUseCase(fs));

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(
        fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", PLUGIN_KEY)))
      ).toBe(true);
      expect(fs.deletedPaths.some((p) => p.includes(join(".ssh", "id_rsa")))).toBe(false);
      expect(logger.warnMessages.some((m) => m.includes("id_rsa"))).toBe(true);
    });

    it("refuses to delete a plugin whose own directory is a symlink resolving outside the user-scope directory", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: { [PLUGIN_KEY]: "abc123abc123abc123abc123abc123ab" },
          scope: "user",
        })
      );
      const fs = new RecordingFileAdapter();
      const boundary = join(homedir(), ".cursor", "plugins", "local");
      fs.setSymlink(join(boundary, "aidd-context"), "/tmp/evil-aidd-context");
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const logger = new CapturingLogger();
      const useCase = new CleanUseCase(fs, manifestRepo, logger, new GitignoreUseCase(fs));

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(fs.deletedPaths.some((p) => p.includes("evil"))).toBe(false);
      expect(
        fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", PLUGIN_KEY)))
      ).toBe(false);
      expect(logger.warnMessages.some((m) => m.includes(PLUGIN_KEY))).toBe(true);
    });
  });
});

/** Records `uninstallPlugin`/`removeMarketplace` calls in the order they happen, so a
 * test can assert one came before the other without depending on `FakeNativePluginActivator`'s
 * two separate arrays. */
class OrderRecordingActivator implements NativePluginActivator {
  constructor(private readonly calls: string[]) {}
  isAvailable(): boolean {
    return true;
  }
  addMarketplace(): void {}
  enablesPlugins(): boolean {
    return false;
  }
  removeMarketplace(name: string): void {
    this.calls.push(`removeMarketplace:${name}`);
  }
  registrationState(): "live" | "dead" | "unknown" {
    return "live";
  }
  upgradeMarketplaces(): void {}
  enablePlugin(): void {}
  uninstallPlugin(pluginRef: string): void {
    this.calls.push(`uninstall:${pluginRef}`);
  }
}

/** Runs `onRemoveMarketplace` at the exact moment `removeMarketplace` is called, so a test
 * can inspect filesystem state as of that call — proving native undo happens before the
 * built marketplace tree it depends on is deleted. */
class AssertingActivator implements NativePluginActivator {
  constructor(private readonly onRemoveMarketplace: () => void | Promise<void>) {}
  isAvailable(): boolean {
    return true;
  }
  addMarketplace(): void {}
  enablesPlugins(): boolean {
    return false;
  }
  removeMarketplace(): void {
    void this.onRemoveMarketplace();
  }
  registrationState(): "live" | "dead" | "unknown" {
    return "live";
  }
  upgradeMarketplaces(): void {}
  enablePlugin(): void {}
  uninstallPlugin(): void {}
}
