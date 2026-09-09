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
import type { Logger } from "../../../../../src/kernel/ports/logger.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const EXTRA_PLUGIN_FIXTURE = join(
  process.cwd(),
  "tests/fixtures/plugins/claude-format/extra-plugin"
);
const PROJECT_ROOT = "/test-project";
const GREET_PATH = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
const GITHUB_SOURCE = {
  kind: "git-subdir" as const,
  url: "https://github.com/ai-driven-dev/framework.git",
  path: "plugins/sample-plugin",
};

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

class RefusingMarketplaceRegistry extends InMemoryMarketplaceRegistry {
  override async list(): Promise<readonly Marketplace[]> {
    throw new Error("the registry was consulted");
  }
}

function buildAddUseCase(
  deps: Deps,
  registry: InMemoryMarketplaceRegistry = deps.marketplaceRegistry,
  logger: Logger = deps.logger
): PluginAddUseCase {
  return new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    logger,
    registry,
    fakeEnsureBuiltMarketplace()
  );
}

async function makeUseCase(deps: Deps) {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  return buildAddUseCase(deps);
}

async function saveMarketplace(
  registry: InMemoryMarketplaceRegistry,
  name: string,
  source: { kind: "github"; repo: string } | { kind: "local"; path: string }
): Promise<void> {
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({ name, source, scope: "project", addedAt: "2026-05-01T00:00:00.000Z" })
  );
}

function localAdd(toolId: "claude" | "opencode", path = PLUGIN_FIXTURE, replace?: boolean) {
  return {
    source: { kind: "local" as const, path },
    toolIds: [toolId],
    projectRoot: PROJECT_ROOT,
    interactive: false,
    replace,
  };
}

function pluginNames(deps: Deps, toolId: "claude" | "opencode" | "codex"): string[] {
  return (deps.manifestRepo.getCurrent()?.getPlugins(toolId) ?? []).map((p) => p.name).sort();
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

  describe("marketplace resolution", () => {
    it("resolves the named marketplace rather than the first registered one", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      const registry = new InMemoryMarketplaceRegistry();
      await saveMarketplace(registry, "aidd-framework", {
        kind: "github",
        repo: "ai-driven-dev/framework",
      });
      await saveMarketplace(registry, "local-mkt", { kind: "local", path: "/mkt-source" });

      await buildAddUseCase(deps, registry).execute({
        ...localAdd("claude"),
        marketplace: "local-mkt",
      });

      const installed = deps.manifestRepo
        .getCurrent()
        ?.getPlugins("claude")
        .find((p) => p.name === "sample-plugin");
      expect(installed?.marketplace).toBe("local-mkt");
    });

    it("treats a marketplace name the registry does not list as a local marketplace", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);

      await useCase.execute({ ...localAdd("claude"), marketplace: "ghost" });

      const installed = deps.manifestRepo
        .getCurrent()
        ?.getPlugins("claude")
        .find((p) => p.name === "sample-plugin");
      expect(installed?.marketplace).toBe("ghost");
    });

    it("never consults the registry for a local add without a marketplace", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });

      await buildAddUseCase(deps, new RefusingMarketplaceRegistry()).execute(localAdd("claude"));

      expect(deps.fs.has(GREET_PATH)).toBe(true);
    });
  });

  describe("github marketplace re-registration", () => {
    async function registerTwice(deps: Deps, replace: boolean | undefined): Promise<void> {
      const registry = new InMemoryMarketplaceRegistry();
      await saveMarketplace(registry, "aidd-framework", {
        kind: "github",
        repo: "ai-driven-dev/framework",
      });
      const useCase = buildAddUseCase(deps, registry);
      const options = {
        source: GITHUB_SOURCE,
        toolIds: ["codex" as const],
        projectRoot: PROJECT_ROOT,
        marketplace: "aidd-framework",
        interactive: false,
        pluginMetadata: { name: "sample-plugin", version: "1.0.0", strict: false },
      };
      await useCase.execute(options);
      await useCase.execute({ ...options, replace });
    }

    it("re-registers the plugin when replace is requested", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "codex");

      await registerTwice(deps, true);

      expect(pluginNames(deps, "codex")).toStrictEqual(["sample-plugin"]);
    });

    it("refuses a second registration without replace", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "codex");

      await expect(registerTwice(deps, undefined)).rejects.toThrow(DuplicatePluginError);
    });

    it("fetches the distribution once for a flat tool when the catalog omits the version", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "opencode");
      deps.fs.setFile("/built/opencode/.opencode/skills/sample-plugin/demo/SKILL.md", "# Demo");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      deps.pluginFetcher.register(GITHUB_SOURCE, PLUGIN_FIXTURE);
      const registry = new InMemoryMarketplaceRegistry();
      await saveMarketplace(registry, "aidd-framework", {
        kind: "github",
        repo: "ai-driven-dev/framework",
      });
      const fetchSpy = vi.spyOn(deps.pluginFetcher, "fetch");

      await buildAddUseCase(deps, registry).execute({
        source: GITHUB_SOURCE,
        toolIds: ["opencode"],
        projectRoot: PROJECT_ROOT,
        marketplace: "aidd-framework",
        interactive: false,
        pluginMetadata: { name: "sample-plugin", strict: false },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("duplicate and replace for a local add", () => {
    it("re-adds an installed plugin in place when replace is requested", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await useCase.execute(localAdd("claude"));

      await useCase.execute(localAdd("claude", PLUGIN_FIXTURE, true));

      expect(pluginNames(deps, "claude")).toStrictEqual(["sample-plugin"]);
    });

    it("leaves another installed plugin registered when replacing", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await seedFromDirectory(deps.fs, EXTRA_PLUGIN_FIXTURE, { useAbsolutePaths: true });
      await useCase.execute(localAdd("claude"));

      await useCase.execute(localAdd("claude", EXTRA_PLUGIN_FIXTURE, true));

      expect(pluginNames(deps, "claude")).toStrictEqual(["extra-plugin", "sample-plugin"]);
    });

    it("accepts a second plugin with a different name", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await seedFromDirectory(deps.fs, EXTRA_PLUGIN_FIXTURE, { useAbsolutePaths: true });
      await useCase.execute(localAdd("claude"));

      await useCase.execute(localAdd("claude", EXTRA_PLUGIN_FIXTURE));

      expect(pluginNames(deps, "claude")).toStrictEqual(["extra-plugin", "sample-plugin"]);
    });

    it("leaves the installed files untouched when refusing a duplicate", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);
      await useCase.execute(localAdd("claude"));
      const installedContent = deps.fs.getFile(GREET_PATH);
      deps.fs.setFile(
        "/alt/sample-plugin/.claude-plugin/plugin.json",
        JSON.stringify({ name: "sample-plugin", version: "1.0.0" })
      );
      deps.fs.setFile("/alt/sample-plugin/commands/greet.md", "# Changed greeting");

      await expect(useCase.execute(localAdd("claude", "/alt/sample-plugin"))).rejects.toThrow(
        DuplicatePluginError
      );

      expect(deps.fs.getFile(GREET_PATH)).toBe(installedContent);
    });
  });

  describe("required version", () => {
    it("accepts a required version equal to the plugin's own", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      const useCase = await makeUseCase(deps);

      await useCase.execute({ ...localAdd("claude"), requiredVersion: "1.0.0" });

      expect(pluginNames(deps, "claude")).toStrictEqual(["sample-plugin"]);
    });
  });

  describe("native tool from a local marketplace", () => {
    it("registers a claude plugin from a local marketplace without writing its files", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      const registry = new InMemoryMarketplaceRegistry();
      await saveMarketplace(registry, "local-mkt", { kind: "local", path: "/mkt-source" });

      await buildAddUseCase(deps, registry).execute({
        ...localAdd("claude"),
        marketplace: "local-mkt",
      });

      const installed = deps.manifestRepo
        .getCurrent()
        ?.getPlugins("claude")
        .find((p) => p.name === "sample-plugin");
      expect([
        installed?.marketplace,
        installed?.files.size,
        deps.fs.has(GREET_PATH),
      ]).toStrictEqual(["local-mkt", 0, false]);
    });

    it("materializes a plugin a local marketplace catalogs from github", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      deps.pluginFetcher.register(GITHUB_SOURCE, PLUGIN_FIXTURE);
      const registry = new InMemoryMarketplaceRegistry();
      await saveMarketplace(registry, "local-mkt", { kind: "local", path: "/mkt-source" });

      await buildAddUseCase(deps, registry).execute({
        source: GITHUB_SOURCE,
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        marketplace: "local-mkt",
        interactive: false,
      });

      const installed = deps.manifestRepo
        .getCurrent()
        ?.getPlugins("claude")
        .find((p) => p.name === "sample-plugin");
      expect([
        installed?.marketplace,
        installed?.files.has(".claude/plugins/sample-plugin/commands/greet.md"),
        deps.fs.has(GREET_PATH),
      ]).toStrictEqual(["local-mkt", true, true]);
    });
  });

  describe("install notices", () => {
    it("logs no install notice for a flat add", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "opencode");
      await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
      const logger = new CapturingLogger();

      await buildAddUseCase(deps, deps.marketplaceRegistry, logger).execute(localAdd("opencode"));

      expect(logger.infoMessages).toStrictEqual([]);
    });
  });
});
