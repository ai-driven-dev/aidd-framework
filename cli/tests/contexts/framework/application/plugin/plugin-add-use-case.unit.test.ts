import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import type { PluginDistributionReader } from "../../../../../src/contexts/framework/domain/ports/plugin-distribution-reader.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { PluginDistribution } from "../../../../../src/contexts/translate/domain/plugin-distribution.js";
import {
  DuplicatePluginError,
  MissingPluginMetadataError,
} from "../../../../../src/kernel/errors.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

async function makeUseCase(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  return new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  );
}

describe("PluginAddUseCase", () => {
  describe("add local plugin for claude", () => {
    it("writes plugin files and updates manifest", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await useCase.execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });
      expect(
        deps.fs.has(join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md"))
      ).toBe(true);
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      expect(plugins.some((p) => p.name === "sample-plugin")).toBe(true);
    });
  });

  describe("duplicate plugin add", () => {
    it("throws DuplicatePluginError on second add of same plugin", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await useCase.execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });
      await expect(
        useCase.execute({
          source: { kind: "local", path: PLUGIN_FIXTURE },
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).rejects.toThrow(DuplicatePluginError);
    });
  });

  describe("github marketplace plugin", () => {
    it("skips fetch and registers plugin reference without materializing files", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "aidd-framework",
          source: { kind: "github", repo: "ai-driven-dev/framework" },
          scope: "project",
          addedAt: "2026-05-01T00:00:00.000Z",
        })
      );
      const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
      const useCase = new PluginAddUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        new PluginDistributionReaderAdapter(deps.fs),
        deps.hasher,
        deps.logger,
        registry,
        fakeEnsureBuiltMarketplace()
      );
      await useCase.execute({
        source: {
          kind: "git-subdir",
          url: "https://github.com/ai-driven-dev/framework.git",
          path: "plugins/aidd-context",
        },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        marketplace: "aidd-framework",
        interactive: false,
        pluginMetadata: { name: "aidd-context", version: "1.0.0", strict: false },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      const installed = plugins.find((p) => p.name === "aidd-context");
      expect(installed?.marketplace).toBe("aidd-framework");
      expect(installed?.files.size).toBe(0);
    });

    it("throws MissingPluginMetadataError when pluginMetadata is absent for github marketplace", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "aidd-framework",
          source: { kind: "github", repo: "ai-driven-dev/framework" },
          scope: "project",
          addedAt: "2026-05-01T00:00:00.000Z",
        })
      );
      const useCase = new PluginAddUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        new PluginDistributionReaderAdapter(deps.fs),
        deps.hasher,
        deps.logger,
        registry,
        fakeEnsureBuiltMarketplace()
      );
      await expect(
        useCase.execute({
          source: {
            kind: "git-subdir",
            url: "https://github.com/ai-driven-dev/framework.git",
            path: "plugins/aidd-context",
          },
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
        })
      ).rejects.toThrow(MissingPluginMetadataError);
    });

    it("preserves fetch behavior for local marketplace plugin", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "local-mkt",
          source: { kind: "local", path: "/mkt-source" },
          scope: "project",
          addedAt: "2026-05-01T00:00:00.000Z",
        })
      );
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
      const useCase = new PluginAddUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        new PluginDistributionReaderAdapter(deps.fs),
        deps.hasher,
        deps.logger,
        registry,
        fakeEnsureBuiltMarketplace()
      );
      await useCase.execute({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        marketplace: "local-mkt",
        interactive: false,
      });
      expect(fetchSpy).toHaveBeenCalled();
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      expect(plugins.some((p) => p.name === "sample-plugin")).toBe(true);
    });
  });

  describe("per-tool install strategy (github marketplace)", () => {
    async function makeGithubRegistry(projectRoot: string): Promise<InMemoryMarketplaceRegistry> {
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        projectRoot,
        Marketplace.create({
          name: "aidd-framework",
          source: { kind: "github", repo: "ai-driven-dev/framework" },
          scope: "project",
          addedAt: "2026-05-01T00:00:00.000Z",
        })
      );
      return registry;
    }

    const GIT_SUBDIR_SOURCE = {
      kind: "git-subdir" as const,
      url: "https://github.com/ai-driven-dev/framework.git",
      path: "plugins/sample-plugin",
    };

    const PLUGIN_METADATA = { name: "sample-plugin", version: "1.0.0", strict: false };

    describe("the catalog's strict", () => {
      it("lands on every installed entry, whatever the plugin's own manifest says", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "opencode");
        deps.fs.setFile(
          "/built/opencode/.opencode/skills/sample-plugin/demo/SKILL.md",
          "# Demo skill"
        );
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          await makeGithubRegistry(PROJECT_ROOT),
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["opencode"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: { ...PLUGIN_METADATA, strict: true },
        });
        const manifest = await deps.manifestRepo.load();
        const installed = manifest?.getPlugins("opencode").find((p) => p.name === "sample-plugin");
        expect(installed?.strict).toBe(true);
      });
    });

    describe("opencode", () => {
      it("fetches and materializes flat files", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "opencode");
        // OpenCode copies its per-target flat BUILT tree (skills nested under
        // <plugin>/, agents namespaced <plugin>-<name>).
        deps.fs.setFile(
          "/built/opencode/.opencode/skills/sample-plugin/demo/SKILL.md",
          "# Demo skill"
        );
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["opencode"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: PLUGIN_METADATA,
        });
        expect(fetchSpy).toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const plugins = manifest?.getPlugins("opencode") ?? [];
        const installed = plugins.find((p) => p.name === "sample-plugin");
        expect(installed).toBeDefined();
        expect(installed?.files.size).toBeGreaterThan(0);
      });
    });

    describe("cursor", () => {
      it("fetches and materializes files in Mode B user-scope", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "cursor");
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        // Cursor copies the per-target BUILT tree verbatim; seed it.
        deps.fs.setFile("/built/cursor/plugins/sample-plugin/skills/demo/SKILL.md", "# Demo skill");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["cursor"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: PLUGIN_METADATA,
        });
        expect(fetchSpy).toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const plugins = manifest?.getPlugins("cursor") ?? [];
        const installed = plugins.find((p) => p.name === "sample-plugin");
        expect(installed).toBeDefined();
        expect(installed?.files.size).toBeGreaterThan(0);
      });
    });

    describe("codex", () => {
      it("reads version from plugin.json when catalog omits it", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "codex");
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["codex"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: { name: "sample-plugin", strict: false },
        });
        expect(fetchSpy).toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const installed = (manifest?.getPlugins("codex") ?? []).find(
          (p) => p.name === "sample-plugin"
        );
        expect(installed?.version).toBe("1.0.0");
        expect(installed?.files.size).toBe(0);
      });

      it("registers only without writing files", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "codex");
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["codex"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: PLUGIN_METADATA,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const plugins = manifest?.getPlugins("codex") ?? [];
        const installed = plugins.find((p) => p.name === "sample-plugin");
        expect(installed).toBeDefined();
        expect(installed?.files.size).toBe(0);
      });
    });

    describe("claude", () => {
      it("reads version from plugin.json when catalog omits it", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "claude");
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: { name: "sample-plugin", strict: false },
        });
        const manifest = await deps.manifestRepo.load();
        const installed = (manifest?.getPlugins("claude") ?? []).find(
          (p) => p.name === "sample-plugin"
        );
        expect(installed?.version).toBe("1.0.0");
        expect(installed?.files.size).toBe(0);
      });

      it("registers only without writing files", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "claude");
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: PLUGIN_METADATA,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const plugins = manifest?.getPlugins("claude") ?? [];
        const installed = plugins.find((p) => p.name === "sample-plugin");
        expect(installed).toBeDefined();
        expect(installed?.files.size).toBe(0);
      });
    });

    describe("copilot", () => {
      it("reads version from plugin.json when catalog omits it", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "copilot");
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        deps.pluginFetcher.register(GIT_SUBDIR_SOURCE, PLUGIN_FIXTURE);
        const registry = await makeGithubRegistry(PROJECT_ROOT);
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: GIT_SUBDIR_SOURCE,
          toolIds: ["copilot"],
          projectRoot: PROJECT_ROOT,
          marketplace: "aidd-framework",
          interactive: false,
          pluginMetadata: { name: "sample-plugin", strict: false },
        });
        const manifest = await deps.manifestRepo.load();
        const installed = (manifest?.getPlugins("copilot") ?? []).find(
          (p) => p.name === "sample-plugin"
        );
        expect(installed?.version).toBe("1.0.0");
        expect(installed?.files.size).toBe(0);
      });
    });
  });

  describe("per-tool install strategy (local marketplace)", () => {
    describe("opencode", () => {
      it("materializes flat files even when source is local marketplace", async () => {
        const deps = await buildUnitDeps(PROJECT_ROOT);
        await initAndInstall(deps, PROJECT_ROOT, "opencode");
        // OpenCode copies its per-target flat BUILT tree (skills nested under
        // <plugin>/, agents namespaced <plugin>-<name>).
        deps.fs.setFile(
          "/built/opencode/.opencode/skills/sample-plugin/demo/SKILL.md",
          "# Demo skill"
        );
        await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
        const registry = new InMemoryMarketplaceRegistry();
        await registry.save(
          PROJECT_ROOT,
          Marketplace.create({
            name: "local-mkt",
            source: { kind: "local", path: "/mkt-source" },
            scope: "project",
            addedAt: "2026-05-01T00:00:00.000Z",
          })
        );
        const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");
        const useCase = new PluginAddUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.pluginFetcher,
          new PluginDistributionReaderAdapter(deps.fs),
          deps.hasher,
          deps.logger,
          registry,
          fakeEnsureBuiltMarketplace()
        );
        await useCase.execute({
          source: { kind: "local", path: PLUGIN_FIXTURE },
          toolIds: ["opencode"],
          projectRoot: PROJECT_ROOT,
          marketplace: "local-mkt",
          interactive: false,
        });
        expect(fetchSpy).toHaveBeenCalled();
        const manifest = await deps.manifestRepo.load();
        const plugins = manifest?.getPlugins("opencode") ?? [];
        const installed = plugins.find((p) => p.name === "sample-plugin");
        expect(installed).toBeDefined();
        expect(installed?.files.size).toBeGreaterThan(0);
      });
    });
  });

  describe("zero-files guard regression (Blocker 2)", () => {
    it("native tool + local source + marketplace + zero-translation distribution → manifest entry NOT added", async () => {
      // A distribution with no recognized manifest path produces zero translated files for a
      // native tool, and a plugin with zero files is never added to the manifest.
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const zeroFilesReader: PluginDistributionReader = {
        read: async () =>
          new PluginDistribution({
            manifest: { name: "zero-plugin", version: "1.0.0" },
            format: "claude",
            files: [],
            components: { commands: [], agents: [], rules: [], skills: [], hooks: [], mcp: [] },
          }),
      };
      const registry = new InMemoryMarketplaceRegistry();
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "local-mkt",
          source: { kind: "local", path: "/mkt-source" },
          scope: "project",
          addedAt: "2026-05-01T00:00:00.000Z",
        })
      );
      const useCase = new PluginAddUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.pluginFetcher,
        zeroFilesReader,
        deps.hasher,
        deps.logger,
        registry,
        fakeEnsureBuiltMarketplace()
      );
      await useCase.execute({
        source: { kind: "local", path: "/some-plugin" },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        marketplace: "local-mkt",
        interactive: false,
      });
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      expect(plugins.find((p) => p.name === "zero-plugin")).toBeUndefined();
    });
  });
});
