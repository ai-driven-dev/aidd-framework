import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { CleanUseCase } from "../../../../src/contexts/framework/application/clean-use-case.js";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { UserSourceReferencesAdapter } from "../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { cursorProjectHooksScriptDir } from "../../../../src/contexts/tools/domain/formats/cursor-hooks-project-merge.js";
import type { NativePluginActivator } from "../../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import { FileHash, InstallationFile } from "../../../../src/kernel/file.js";
import type { AiToolId, ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { FakeHostPluginRegistryReader } from "../../../helpers/ports/fake-host-plugin-registry-reader.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { RecordingPrompter } from "../../../helpers/ports/recording-prompter.js";

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

// Cursor Mode B: the file key is base-relative — no absolute prefix, resolved against
// the user plugins dir.
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
      // The message must name all three survivors: the host's own registration,
      // `userConfigDir()/marketplaces.json`, and the tool's own plugin cache.
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

      // A real `claude` binary registers at its own implicit default `"user"` whatever the
      // manifest recorded, so a `"project"`-only uninstall left the plugin behind silently.
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
        // Only this project's own claim is dropped, and the other project — reading the
        // very same registry — still finds the marketplace registered.
        expect(await userSourceReferences.listAllReferencingProjects()).toContain(
          OTHER_PROJECT_ROOT
        );
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

      // A verb-agreement bug hides in the plural alone: the passive phrasing sidesteps the
      // question for either count, so only the plural case can pin it.
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
        expect(await userSourceReferences.listAllReferencingProjects()).not.toContain(PROJECT_ROOT);
      });

      it("names the other project still referencing the shared source in a dry-run, without dropping anything", async () => {
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
        expect(result.preview.sharedSourceOtherProjects).toEqual([OTHER_PROJECT_ROOT]);
        // A dry-run must never write: both projects still hold their reference.
        expect(await userSourceReferences.listAllReferencingProjects()).toEqual(
          expect.arrayContaining([PROJECT_ROOT, OTHER_PROJECT_ROOT])
        );
      });

      // Two projects synced under different CLI versions record their claims under two
      // different keys, so only a read across every key sees the other project's.
      it("names the other project in a dry-run even when the two projects were recorded under different CLI versions", async () => {
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
        await userSourceReferences.addReference("2.0.0", OTHER_PROJECT_ROOT);
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
        expect(result.preview.sharedSourceOtherProjects).toEqual([OTHER_PROJECT_ROOT]);
      });

      // A reference sits under the CLI version that wrote it, which the running binary may
      // have moved past; `CleanUseCase` has no version reader and must still find it.
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
        // Both projects registered at an older CLI version — this use case has no way to
        // know or care what version is "current" today.
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

        expect(await userSourceReferences.listAllReferencingProjects()).not.toContain(PROJECT_ROOT);
        expect(await userSourceReferences.listAllReferencingProjects()).toContain(
          OTHER_PROJECT_ROOT
        );
        const message = logger.warnMessages.find((m) => m.includes("shared by every project"));
        expect(message).toBeDefined();
        expect(message).toContain("Still referenced by 1 other project on this machine.");
      });

      // `references.json` is a help, not an authority — a corrupted copy must never block
      // the destructive command that does not depend on it.
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
        expect(result.preview.sharedSourceOtherProjects).toBeUndefined();
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
      // The cache `purgeNativeCaches` never gets to consider — this tool's absent binary
      // keeps it out of `undone` — must still be named, by the same absolute path.
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

    describe("what the host is told, word for word", () => {
      const HOME = "/fake-home";
      const CODEX_CACHE = join(HOME, ".codex", "plugins", "cache");

      function buildUseCase(deps: {
        manifest: Manifest;
        fs: InMemoryFileAdapter;
        logger: CapturingLogger;
        activators: ReadonlyMap<string, NativePluginActivator>;
        registry: InMemoryMarketplaceRegistry | undefined;
      }): CleanUseCase {
        return new CleanUseCase(
          deps.fs,
          new InMemoryManifestRepository(deps.manifest, PROJECT_ROOT),
          deps.logger,
          new GitignoreUseCase(deps.fs),
          deps.activators,
          deps.registry,
          undefined,
          new Map(),
          () => HOME
        );
      }

      it("names the absent binary alone when no activator is wired for it", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger,
          activators: new Map(),
          registry: seedMarketplaceRegistry(),
        });

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(result.manifestFound).toBe(true);
        expect(logger.warnMessages).toStrictEqual([
          `codex: registration left in place, the codex CLI is not on the PATH. Its cache survives at: ${join(CODEX_CACHE, MARKETPLACE)}.`,
        ]);
      });

      it("leaves a registration in place when its alias is no longer registered here, still uninstalling the plugin ref", async () => {
        const fs = new InMemoryFileAdapter();
        fs.setFile(join(CODEX_CACHE, MARKETPLACE, "leftover.json"), "{}");
        const logger = new CapturingLogger();
        const activator = new FakeNativePluginActivator({ available: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: "other-mkt",
            source: { kind: "local", path: "/other/built/path" },
            scope: "project",
            addedAt: "2026-01-01T00:00:00.000Z",
          })
        );
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger,
          activators: new Map([[BINARY, activator]]),
          registry,
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(activator.uninstalledPlugins).toStrictEqual([REF]);
        expect(activator.removedMarketplaces).toStrictEqual([]);
        expect(logger.warnMessages).toStrictEqual([
          `codex: '${MARKETPLACE}' is no longer a registered marketplace here, so its scope cannot be resolved — its codex registration was left in place.`,
          `codex: cache for '${MARKETPLACE}' left in place, its own removal was not confirmed: ${join(CODEX_CACHE, MARKETPLACE)}`,
        ]);
      });

      it("leaves a registration in place when no marketplace registry is wired in at all", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const activator = new FakeNativePluginActivator({ available: true });
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger,
          activators: new Map([[BINARY, activator]]),
          registry: undefined,
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(activator.removedMarketplaces).toStrictEqual([]);
        expect(logger.warnMessages).toStrictEqual([
          `codex: '${MARKETPLACE}' is no longer a registered marketplace here, so its scope cannot be resolved — its codex registration was left in place.`,
          `codex: cache for '${MARKETPLACE}' left in place, its own removal was not confirmed: ${join(CODEX_CACHE, MARKETPLACE)}`,
        ]);
      });

      it("names a refused marketplace removal by the host's own words", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const activator = new FakeNativePluginActivator({ available: true, throwOnRemove: true });
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger,
          activators: new Map([[BINARY, activator]]),
          registry: seedMarketplaceRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          `codex marketplace remove '${MARKETPLACE}' failed: marketplace remove ${MARKETPLACE} failed: '${MARKETPLACE}' is not configured or installed`,
          `codex: cache for '${MARKETPLACE}' left in place, its own removal was not confirmed: ${join(CODEX_CACHE, MARKETPLACE)}`,
        ]);
      });

      it("names a refused plugin uninstall by the host's own words, after trying both scopes", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const activator = new FakeNativePluginActivator({
          available: true,
          failOnUninstall: [REF],
        });
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger,
          activators: new Map([[BINARY, activator]]),
          registry: seedMarketplaceRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(activator.uninstalledPluginScopes).toStrictEqual(["project", "user"]);
        expect(logger.warnMessages).toStrictEqual([
          `codex plugin uninstall '${REF}' failed: plugin \`${REF}\` is not installed`,
        ]);
      });

      it("propagates an activator failure that is not the host refusing", async () => {
        const fs = new InMemoryFileAdapter();
        const useCase = buildUseCase({
          manifest: seedManifestWithNativeRegistrations(),
          fs,
          logger: new CapturingLogger(),
          activators: new Map([[BINARY, new CrashingUninstallActivator()]]),
          registry: seedMarketplaceRegistry(),
        });

        await expect(useCase.execute({ projectRoot: PROJECT_ROOT, force: true })).rejects.toThrow(
          "activator crashed uninstalling a plugin"
        );
      });

      function seedSharedRegistry(): InMemoryMarketplaceRegistry {
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
        return registry;
      }

      function seedRegistrations(toolId: ToolId, binary: string): Manifest {
        const manifest = Manifest.create();
        manifest.addTool(toolId, "1.0.0", []);
        manifest.setNativeRegistrations(toolId, {
          binary,
          marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
          pluginRefs: [],
        });
        return manifest;
      }

      it("names no cache for a shared marketplace at a host whose profile declares no cache directory (copilot)", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedRegistrations("copilot", "copilot"),
          fs,
          logger,
          activators: new Map([["copilot", new FakeNativePluginActivator({ available: true })]]),
          registry: seedSharedRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          `copilot: '${MARKETPLACE}' is shared by every project on this machine — left registered. Its entry survives at userConfigDir()/marketplaces.json.`,
        ]);
      });

      it("names no cache for a shared marketplace at a tool that drives no native CLI (cursor)", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedRegistrations("cursor", "cursor"),
          fs,
          logger,
          activators: new Map([["cursor", new FakeNativePluginActivator({ available: true })]]),
          registry: seedSharedRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          `cursor: '${MARKETPLACE}' is shared by every project on this machine — left registered. Its entry survives at userConfigDir()/marketplaces.json.`,
        ]);
      });

      it("never treats a shared marketplace it left registered as one the host forgot, so its cache stays", async () => {
        const fs = new InMemoryFileAdapter();
        fs.setFile(join(CODEX_CACHE, MARKETPLACE, "leftover.json"), "{}");
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedRegistrations("codex", BINARY),
          fs,
          logger,
          activators: new Map([[BINARY, new FakeNativePluginActivator({ available: true })]]),
          registry: seedSharedRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(fs.has(join(CODEX_CACHE, MARKETPLACE, "leftover.json"))).toBe(true);
        expect(logger.warnMessages).toStrictEqual([
          `codex: '${MARKETPLACE}' is shared by every project on this machine — left registered. Its entry survives at userConfigDir()/marketplaces.json, and its cache at: ${join(CODEX_CACHE, MARKETPLACE)}.`,
          `codex: cache for '${MARKETPLACE}' left in place, its own removal was not confirmed: ${join(CODEX_CACHE, MARKETPLACE)}`,
        ]);
      });

      it("names no surviving cache when the absent binary's profile declares no cache directory (copilot)", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedRegistrations("copilot", "copilot"),
          fs,
          logger,
          activators: new Map(),
          registry: seedSharedRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          "copilot: registration left in place, the copilot CLI is not on the PATH.",
        ]);
      });

      it("names no surviving cache when the absent binary belongs to a tool that drives no native CLI (cursor)", async () => {
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest: seedRegistrations("cursor", "cursor"),
          fs,
          logger,
          activators: new Map(),
          registry: seedSharedRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          "cursor: registration left in place, the cursor CLI is not on the PATH.",
        ]);
      });

      it("names no surviving cache when the absent binary registered no marketplace", async () => {
        const manifest = Manifest.create();
        manifest.addTool("codex", "1.0.0", []);
        manifest.setNativeRegistrations("codex", {
          binary: BINARY,
          marketplaces: [],
          pluginRefs: [REF],
        });
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest,
          fs,
          logger,
          activators: new Map(),
          registry: seedMarketplaceRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          "codex: registration left in place, the codex CLI is not on the PATH.",
        ]);
      });

      it("names every surviving cache of an absent binary, one path per marketplace", async () => {
        const manifest = Manifest.create();
        manifest.addTool("codex", "1.0.0", []);
        manifest.setNativeRegistrations("codex", {
          binary: BINARY,
          marketplaces: [
            { alias: "mkt-a", hostName: "mkt-a" },
            { alias: "mkt-b", hostName: "mkt-b" },
          ],
          pluginRefs: [],
        });
        const fs = new InMemoryFileAdapter();
        const logger = new CapturingLogger();
        const useCase = buildUseCase({
          manifest,
          fs,
          logger,
          activators: new Map(),
          registry: seedMarketplaceRegistry(),
        });

        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(logger.warnMessages).toStrictEqual([
          `codex: registration left in place, the codex CLI is not on the PATH. Its cache survives at: ${join(CODEX_CACHE, "mkt-a")}, ${join(CODEX_CACHE, "mkt-b")}.`,
        ]);
      });
    });

    describe("the scope the manifest recorded for a plugin ref, at cursor, the one host admitting a user-scope record", () => {
      const CURSOR_REF = "aidd-context@aidd-framework";

      function seedCursorManifest(
        marketplaces: ReadonlyArray<{ alias: string; hostName: string }>,
        plugins: ReadonlyArray<{ name: string; scope: "project" | "user"; marketplace: string }>
      ): Manifest {
        const manifest = Manifest.create();
        manifest.addTool("cursor", "1.0.0", []);
        for (const plugin of plugins) {
          manifest.addPlugin(
            "cursor",
            InstalledPlugin.fromMetadata(
              plugin.name,
              "1.0.0",
              { kind: "github", repo: "ai-driven-dev/framework" },
              true,
              plugin.scope,
              plugin.marketplace
            )
          );
        }
        manifest.setNativeRegistrations("cursor", {
          binary: "cursor",
          marketplaces: [...marketplaces],
          pluginRefs: [CURSOR_REF],
        });
        return manifest;
      }

      async function uninstallScopesFor(manifest: Manifest): Promise<readonly string[]> {
        const fs = new InMemoryFileAdapter();
        const activator = new FakeNativePluginActivator({
          available: true,
          installedAtScope: new Map([[CURSOR_REF, "user"]]),
        });
        const useCase = new CleanUseCase(
          fs,
          new InMemoryManifestRepository(manifest, PROJECT_ROOT),
          new CapturingLogger(),
          new GitignoreUseCase(fs),
          new Map([["cursor", activator]]),
          seedMarketplaceRegistry()
        );
        await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });
        return activator.uninstalledPluginScopes;
      }

      it("tries the user scope first when that is what the manifest recorded for the plugin behind the ref, found by its own alias among several", async () => {
        const scopes = await uninstallScopesFor(
          seedCursorManifest(
            [
              { alias: "other", hostName: "other-host" },
              { alias: MARKETPLACE, hostName: MARKETPLACE },
            ],
            [
              { name: "other-plugin", scope: "project", marketplace: MARKETPLACE },
              { name: "aidd-context", scope: "user", marketplace: MARKETPLACE },
            ]
          )
        );

        expect(scopes).toStrictEqual(["user"]);
      });

      it("tries the project scope first when the plugin's alias matches no recorded marketplace", async () => {
        const scopes = await uninstallScopesFor(
          seedCursorManifest(
            [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
            [{ name: "aidd-context", scope: "user", marketplace: "unknown-alias" }]
          )
        );

        expect(scopes).toStrictEqual(["project", "user"]);
      });

      it("tries the project scope first when the manifest records no plugin at all for the ref", async () => {
        const scopes = await uninstallScopesFor(
          seedCursorManifest([{ alias: MARKETPLACE, hostName: MARKETPLACE }], [])
        );

        expect(scopes).toStrictEqual(["project", "user"]);
      });
    });

    it("previews no shared-source fact when the references port is wired in but no marketplace registry is", async () => {
      const fs = new InMemoryFileAdapter();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(seedManifestWithNativeRegistrations(), PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map(),
        undefined,
        undefined,
        new Map(),
        () => "/fake-home",
        new UserSourceReferencesAdapter(fs, () => "/fake-home/.config/aidd")
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(result).toStrictEqual({
        dryRun: true,
        manifestFound: true,
        preview: {
          tools: [{ toolId: "codex", fileCount: 0 }],
          totalFileCount: 0,
          nativeRegistrations: [
            {
              toolId: "codex",
              binary: BINARY,
              marketplaceCount: 1,
              pluginRefCount: 1,
              cachePaths: [join("/fake-home", ".codex", "plugins", "cache", MARKETPLACE)],
            },
          ],
          sharedSourceOtherProjects: undefined,
        },
        fileCount: 0,
      });
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

  describe("without a manifest", () => {
    it("reports nothing found and nothing to preview", async () => {
      const fs = new InMemoryFileAdapter();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(null, PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(result).toStrictEqual({
        dryRun: false,
        manifestFound: false,
        preview: { tools: [], totalFileCount: 0, nativeRegistrations: [] },
        fileCount: 0,
      });
    });
  });

  describe("confirming before removing anything", () => {
    function buildConfirmingUseCase(
      fs: InMemoryFileAdapter,
      prompter: RecordingPrompter | undefined
    ) {
      return new CleanUseCase(
        fs,
        new InMemoryManifestRepository(seedTrackedFiles(fs, ["a.md"]), PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs),
        new Map(),
        undefined,
        prompter
      );
    }

    it("asks its one question, word for word, and removes everything on yes", async () => {
      const fs = new InMemoryFileAdapter();
      const prompter = new RecordingPrompter(true);
      const useCase = buildConfirmingUseCase(fs, prompter);

      const result = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        force: false,
        interactive: true,
      });

      expect(prompter.confirmMessages).toStrictEqual(["Remove all AIDD files?"]);
      expect(result).toStrictEqual({
        dryRun: false,
        manifestFound: true,
        preview: previewOf([["claude", 1]]),
        fileCount: 1,
      });
      expect(fs.has(join(PROJECT_ROOT, "a.md"))).toBe(false);
    });

    it("removes nothing on no and answers with the dry-run preview", async () => {
      const fs = new InMemoryFileAdapter();
      const useCase = buildConfirmingUseCase(fs, new RecordingPrompter(false));

      const result = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        force: false,
        interactive: true,
      });

      expect(result).toStrictEqual({
        dryRun: true,
        manifestFound: true,
        preview: previewOf([["claude", 1]]),
        fileCount: 0,
      });
      expect(fs.has(join(PROJECT_ROOT, "a.md"))).toBe(true);
    });

    it("never asks outside an interactive run, even with a prompter wired in", async () => {
      const fs = new InMemoryFileAdapter();
      const prompter = new RecordingPrompter(true);
      const useCase = buildConfirmingUseCase(fs, prompter);

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(prompter.confirmMessages).toStrictEqual([]);
      expect(result).toStrictEqual({
        dryRun: true,
        manifestFound: true,
        preview: previewOf([["claude", 1]]),
        fileCount: 0,
      });
    });

    it("stays a dry-run in an interactive run with no prompter wired in", async () => {
      const fs = new InMemoryFileAdapter();
      const useCase = buildConfirmingUseCase(fs, undefined);

      const result = await useCase.execute({
        projectRoot: PROJECT_ROOT,
        force: false,
        interactive: true,
      });

      expect(result.dryRun).toBe(true);
      expect(fs.has(join(PROJECT_ROOT, "a.md"))).toBe(true);
    });
  });

  describe("what a dry-run previews", () => {
    it("counts each tool's tracked and merged files, and totals them", async () => {
      const fs = new InMemoryFileAdapter();
      const manifest = seedTrackedFiles(fs, ["a.md", "b.md"]);
      manifest.addTool(
        "claude",
        "1.0.0",
        [fileEntry("a.md"), fileEntry("b.md")],
        [{ relativePath: ".claude/settings.json", sectionKey: null, entries: { owned: hash() } }]
      );
      manifest.addTool("codex", "1.0.0", [fileEntry("c.md")]);
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(manifest, PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(result).toStrictEqual({
        dryRun: true,
        manifestFound: true,
        preview: previewOf([
          ["claude", 3],
          ["codex", 1],
        ]),
        fileCount: 0,
      });
    });

    it("announces no cache path for a host whose profile declares no cache directory (copilot)", async () => {
      const manifest = Manifest.create();
      manifest.addTool("copilot", "1.0.0", []);
      manifest.setNativeRegistrations("copilot", {
        binary: "copilot",
        marketplaces: [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        pluginRefs: ["aidd-context@aidd-framework"],
      });
      const fs = new InMemoryFileAdapter();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(manifest, PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(result.preview.nativeRegistrations).toStrictEqual([
        {
          toolId: "copilot",
          binary: "copilot",
          marketplaceCount: 1,
          pluginRefCount: 1,
          cachePaths: [],
        },
      ]);
    });

    it("announces no cache path for a tool that drives no native CLI (cursor)", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.setNativeRegistrations("cursor", {
        binary: "cursor",
        marketplaces: [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        pluginRefs: [],
      });
      const fs = new InMemoryFileAdapter();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(manifest, PROJECT_ROOT),
        new CapturingLogger(),
        new GitignoreUseCase(fs)
      );

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: false });

      expect(result.preview.nativeRegistrations).toStrictEqual([
        {
          toolId: "cursor",
          binary: "cursor",
          marketplaceCount: 1,
          pluginRefCount: 0,
          cachePaths: [],
        },
      ]);
    });
  });

  describe("counting what was removed", () => {
    function buildCountingUseCase(
      fs: InMemoryFileAdapter,
      manifest: Manifest,
      logger = new CapturingLogger()
    ) {
      return new CleanUseCase(
        fs,
        new InMemoryManifestRepository(manifest, PROJECT_ROOT),
        logger,
        new GitignoreUseCase(fs)
      );
    }

    it("counts every tracked file and names the tool being removed", async () => {
      const fs = new InMemoryFileAdapter();
      const logger = new CapturingLogger();
      const useCase = buildCountingUseCase(fs, seedTrackedFiles(fs, ["a.md", "b.md"]), logger);

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(result.fileCount).toBe(2);
      expect(fs.has(join(PROJECT_ROOT, "a.md"))).toBe(false);
      expect(fs.has(join(PROJECT_ROOT, "b.md"))).toBe(false);
      expect(logger.infoMessages).toStrictEqual(["Removing claude files..."]);
    });

    it("counts the machine-local settings file a tool wrote outside the manifest", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(join(PROJECT_ROOT, ".claude", "settings.local.json"), "{}");
      const useCase = buildCountingUseCase(fs, seedTrackedFiles(fs, ["a.md"]));

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(result.fileCount).toBe(2);
    });

    it("does not count a machine-local settings file that was never written", async () => {
      const fs = new InMemoryFileAdapter();
      const useCase = buildCountingUseCase(fs, seedTrackedFiles(fs, ["a.md"]));

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(result.fileCount).toBe(1);
    });

    it("counts the project hooks file a cursor plugin was unmerged from", async () => {
      const pluginName = "aidd-context";
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromMetadata(
          pluginName,
          "1.0.0",
          { kind: "local", path: "/p" },
          false,
          "project"
        )
      );
      const fs = new InMemoryFileAdapter();
      const scriptMarker = cursorProjectHooksScriptDir(pluginName);
      fs.setFile(
        join(PROJECT_ROOT, ".cursor", "hooks.json"),
        JSON.stringify({
          version: 1,
          hooks: { PreToolUse: [{ command: `./${scriptMarker}run.js` }] },
        })
      );
      const useCase = buildCountingUseCase(fs, manifest);

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(result.fileCount).toBe(1);
    });

    it("deletes a project-scope plugin's files from the project and counts them", async () => {
      const manifest = Manifest.create();
      manifest.addTool("claude", "1.0.0", []);
      manifest.addPlugin(
        "claude",
        InstalledPlugin.fromMetadata(
          "aidd-context",
          "1.0.0",
          { kind: "local", path: "/p" },
          false,
          "project"
        ).withFiles(new Map([["skills/x.md", HASH]]))
      );
      const fs = new InMemoryFileAdapter();
      fs.setFile(join(PROJECT_ROOT, "skills", "x.md"), "x");
      const useCase = buildCountingUseCase(fs, manifest);

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(fs.has(join(PROJECT_ROOT, "skills", "x.md"))).toBe(false);
      expect(result.fileCount).toBe(1);
    });

    describe("a file merged into one the project shares", () => {
      const MERGED = ".claude/settings.json";

      function seedMerged(
        fs: InMemoryFileAdapter,
        content: string | null,
        ownedKeys: string[]
      ): Manifest {
        const manifest = Manifest.create();
        const entries: Record<string, FileHash> = {};
        for (const key of ownedKeys) entries[key] = hash();
        manifest.addTool(
          "claude",
          "1.0.0",
          [],
          [{ relativePath: MERGED, sectionKey: null, entries }]
        );
        if (content !== null) fs.setFile(join(PROJECT_ROOT, MERGED), content);
        return manifest;
      }

      it("takes back only its own keys, leaving the project's, and counts the file once", async () => {
        const fs = new InMemoryFileAdapter();
        const useCase = buildCountingUseCase(
          fs,
          seedMerged(fs, '{"owned":1,"theirs":2}', ["owned"])
        );

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(fs.getFile(join(PROJECT_ROOT, MERGED))).toBe('{\n  "theirs": 2\n}');
        expect(result.fileCount).toBe(1);
      });

      it("deletes the file once nothing but its own keys was in it", async () => {
        const fs = new InMemoryFileAdapter();
        const useCase = buildCountingUseCase(fs, seedMerged(fs, '{"owned":1}', ["owned"]));

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(fs.has(join(PROJECT_ROOT, MERGED))).toBe(false);
        expect(result.fileCount).toBe(1);
      });

      it("deletes a file it recorded whole, one with no keys of its own", async () => {
        const fs = new InMemoryFileAdapter();
        const useCase = buildCountingUseCase(fs, seedMerged(fs, '{"theirs":2}', []));

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(fs.has(join(PROJECT_ROOT, MERGED))).toBe(false);
        expect(result.fileCount).toBe(1);
      });

      it("skips a merged file already gone, without counting it", async () => {
        const fs = new InMemoryFileAdapter();
        const useCase = buildCountingUseCase(fs, seedMerged(fs, null, ["owned"]));

        const result = await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

        expect(result.fileCount).toBe(0);
      });
    });
  });

  describe("what stays under .aidd/", () => {
    it("says it kept config.json, by its path", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(join(PROJECT_ROOT, ".aidd", "config.json"), "{}");
      const logger = new CapturingLogger();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(seedTrackedFiles(fs, ["a.md"]), PROJECT_ROOT),
        logger,
        new GitignoreUseCase(fs)
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(logger.infoMessages).toStrictEqual([
        "Removing claude files...",
        "Kept .aidd/config.json",
      ]);
    });

    it("says nothing about config.json when another file is what keeps .aidd/ alive", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(join(PROJECT_ROOT, ".aidd", "auth.json"), "{}");
      const logger = new CapturingLogger();
      const useCase = new CleanUseCase(
        fs,
        new InMemoryManifestRepository(seedTrackedFiles(fs, ["a.md"]), PROJECT_ROOT),
        logger,
        new GitignoreUseCase(fs)
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

      expect(logger.infoMessages).toStrictEqual(["Removing claude files..."]);
    });
  });
});

const HASH = "abc123abc123abc123abc123abc123ab";

function hash(): FileHash {
  return new FileHash(HASH);
}

function fileEntry(relativePath: string): InstallationFile {
  return new InstallationFile({ relativePath, content: "", hash: hash() });
}

function seedTrackedFiles(fs: InMemoryFileAdapter, paths: readonly string[]): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", paths.map(fileEntry));
  for (const path of paths) fs.setFile(join(PROJECT_ROOT, path), "x");
  return manifest;
}

function previewOf(tools: ReadonlyArray<readonly [ToolId, number]>) {
  return {
    tools: tools.map(([toolId, fileCount]) => ({ toolId, fileCount })),
    totalFileCount: tools.reduce((sum, [, fileCount]) => sum + fileCount, 0),
    nativeRegistrations: [],
    sharedSourceOtherProjects: undefined,
  };
}

class CrashingUninstallActivator implements NativePluginActivator {
  isAvailable(): boolean {
    return true;
  }
  addMarketplace(): void {}
  enablesPlugins(): boolean {
    return false;
  }
  removeMarketplace(): void {}
  registrationState(): "live" | "dead" | "unknown" {
    return "live";
  }
  upgradeMarketplaces(): void {}
  enablePlugin(): void {}
  uninstallPlugin(): void {
    throw new Error("activator crashed uninstalling a plugin");
  }
}

/** Records `uninstallPlugin`/`removeMarketplace` calls in the order they happen, so a test
 * can assert one came before the other. */
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
 * can prove native undo happens before the built tree it depends on is deleted. */
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
