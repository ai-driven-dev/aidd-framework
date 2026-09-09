import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FetchMarketplaceSourceUseCase } from "../../../../../src/contexts/distribution/application/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../../src/contexts/distribution/application/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginCatalogRepositoryAdapter } from "../../../../../src/contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginInstallFromMarketplaceUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import {
  AmbiguousPluginMatchError,
  PluginNotInMarketplaceError,
  VersionMismatchError,
} from "../../../../../src/kernel/errors.js";
import type { Logger } from "../../../../../src/kernel/ports/logger.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { ChoosingPrompter } from "../../../../helpers/ports/choosing-prompter.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import type { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { KeepPrompter } from "../../../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const EXTRA_PLUGIN_FIXTURE = join(
  process.cwd(),
  "tests/fixtures/plugins/claude-format/extra-plugin"
);
const PROJECT_ROOT = "/test-project";
const MKT1_DIR = "/mkt1";
const MKT2_DIR = "/mkt2";

function seedMarketplaceFile(
  fs: InMemoryFileAdapter,
  dir: string,
  plugins: Array<Record<string, unknown>>
): void {
  fs.writeFile(join(dir, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins }));
}

async function buildUseCase(options: { logger?: Logger | null; prompter?: Prompter } = {}) {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initAndInstall(deps, PROJECT_ROOT, "claude");
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const catalogRepo = new PluginCatalogRepositoryAdapter(deps.fs);
  const pluginAdd = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    registry,
    fakeEnsureBuiltMarketplace()
  );
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(deps.pluginFetcher);
  const logger = options.logger === null ? undefined : (options.logger ?? deps.logger);
  const useCase = new PluginInstallFromMarketplaceUseCase(
    new ResolveMarketplaceUseCase(fetchMarketplaceSource, catalogRepo),
    registry,
    pluginAdd,
    options.prompter ?? new KeepPrompter(),
    logger
  );
  return { useCase, deps, registry };
}

async function saveLocalMarketplace(
  registry: InMemoryMarketplaceRegistry,
  name: string,
  dir: string
): Promise<void> {
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name,
      source: { kind: "local", path: dir },
      scope: "project",
      addedAt: "2026-04-29T10:00:00.000Z",
    })
  );
}

function installedSamplePlugin(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  return deps.manifestRepo
    .getCurrent()
    ?.getPlugins("claude")
    .find((p) => p.name === "sample-plugin");
}

describe("PluginInstallFromMarketplaceUseCase", () => {
  it("installs a plugin found in a single marketplace and tags it", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT1_DIR, [
      { name: "sample-plugin", source: { kind: "local", path: PLUGIN_FIXTURE }, version: "1.0.0" },
    ]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      pluginName: "sample-plugin",
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
    });

    expect(result.marketplace.name).toBe("mkt1");
    const manifest = await deps.manifestRepo.load();
    const plugins = manifest?.getPlugins("claude") ?? [];
    const installed = plugins.find((p) => p.name === "sample-plugin");
    expect(installed?.marketplace).toBe("mkt1");
  });

  it("throws PluginNotInMarketplaceError when no marketplace contains the plugin", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT1_DIR, []);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await expect(
      useCase.execute({
        pluginName: "missing",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      })
    ).rejects.toThrow(PluginNotInMarketplaceError);
  });

  it("throws AmbiguousPluginMatchError on multi-match in non-interactive mode", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    const entry = {
      name: "sample-plugin",
      source: { kind: "local", path: PLUGIN_FIXTURE },
      version: "1.0.0",
    };
    seedMarketplaceFile(deps.fs, MKT1_DIR, [entry]);
    seedMarketplaceFile(deps.fs, MKT2_DIR, [entry]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt2",
        source: { kind: "local", path: MKT2_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await expect(
      useCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      })
    ).rejects.toThrow(AmbiguousPluginMatchError);
  });

  it("respects the --from filter to disambiguate", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    const entry = {
      name: "sample-plugin",
      source: { kind: "local", path: PLUGIN_FIXTURE },
      version: "1.0.0",
    };
    seedMarketplaceFile(deps.fs, MKT1_DIR, [entry]);
    seedMarketplaceFile(deps.fs, MKT2_DIR, [entry]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt2",
        source: { kind: "local", path: MKT2_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      pluginName: "sample-plugin",
      fromMarketplace: "mkt2",
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
    });

    expect(result.marketplace.name).toBe("mkt2");
  });

  it("throws VersionMismatchError when pinned version disagrees with catalog", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT1_DIR, [
      { name: "sample-plugin", source: { kind: "local", path: PLUGIN_FIXTURE }, version: "2.0.0" },
    ]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await expect(
      useCase.execute({
        pluginName: "sample-plugin",
        version: "1.0.0",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      })
    ).rejects.toThrow(VersionMismatchError);
  });

  it("falls back to plugin.json semver when catalog has no version field", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT1_DIR, [
      { name: "sample-plugin", source: { kind: "local", path: PLUGIN_FIXTURE } },
    ]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await expect(
      useCase.execute({
        pluginName: "sample-plugin",
        version: "9.9.9",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      })
    ).rejects.toThrow(VersionMismatchError);
  });

  it("native github tool: reads version from plugin.json when github catalog omits it", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    const GH_MKT_DIR = "/gh-mkt";
    const githubSource = { kind: "github" as const, repo: "ai-driven-dev/framework" };
    deps.fs.writeFile(
      join(GH_MKT_DIR, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        plugins: [{ name: "sample-plugin", source: { kind: "local", path: "sample-plugin" } }],
      })
    );
    deps.pluginFetcher.register(githubSource, GH_MKT_DIR);
    deps.pluginFetcher.register(
      {
        kind: "git-subdir",
        url: "https://github.com/ai-driven-dev/framework.git",
        path: "sample-plugin",
      },
      PLUGIN_FIXTURE
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "aidd-framework",
        source: githubSource,
        scope: "project",
        addedAt: "2026-05-01T00:00:00.000Z",
      })
    );

    await useCase.execute({
      pluginName: "sample-plugin",
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
      autoSelect: true,
      replace: true,
    });

    const manifest = await deps.manifestRepo.load();
    const installed = (manifest?.getPlugins("claude") ?? []).find(
      (p) => p.name === "sample-plugin"
    );
    expect(installed?.marketplace).toBe("aidd-framework");
    expect(installed?.version).toBe("1.0.0");
    expect(installed?.files.size).toBe(0);
  });

  describe("version policy", () => {
    it("throws VersionMismatchError with strict policy (default) when catalog version differs from requested", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "2.0.0",
        },
      ]);
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "mkt1",
          source: { kind: "local", path: MKT1_DIR },
          scope: "project",
          addedAt: "2026-04-29T10:00:00.000Z",
        })
      );

      await expect(
        useCase.execute({
          pluginName: "sample-plugin",
          version: "1.0.0",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).rejects.toThrow(VersionMismatchError);
    });

    it("succeeds and logs info with prefer-catalog policy when catalog version differs from requested", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      const infoSpy = vi.spyOn(deps.logger, "info");
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "2.0.0",
        },
      ]);
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "mkt1",
          source: { kind: "local", path: MKT1_DIR },
          scope: "project",
          addedAt: "2026-04-29T10:00:00.000Z",
        })
      );

      await expect(
        useCase.execute({
          pluginName: "sample-plugin",
          version: "1.0.0",
          requestedVersionPolicy: "prefer-catalog",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).resolves.toBeDefined();
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("2.0.0"));
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("1.0.0"));
    });

    it("does not log info with prefer-catalog policy when catalog and requested versions match", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      const infoSpy = vi.spyOn(deps.logger, "info");
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
        },
      ]);
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "mkt1",
          source: { kind: "local", path: MKT1_DIR },
          scope: "project",
          addedAt: "2026-04-29T10:00:00.000Z",
        })
      );

      await useCase.execute({
        pluginName: "sample-plugin",
        version: "1.0.0",
        requestedVersionPolicy: "prefer-catalog",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      const driftCalls = infoSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("differs from")
      );
      expect(driftCalls).toHaveLength(0);
    });
  });

  it("autoSelect resolves multi-match in non-interactive mode", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    const entry = {
      name: "sample-plugin",
      source: { kind: "local", path: PLUGIN_FIXTURE },
      version: "1.0.0",
    };
    seedMarketplaceFile(deps.fs, MKT1_DIR, [entry]);
    seedMarketplaceFile(deps.fs, MKT2_DIR, [entry]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt2",
        source: { kind: "local", path: MKT2_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      pluginName: "sample-plugin",
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
      autoSelect: true,
    });

    expect(result.marketplace.name).toBe("mkt1");
  });

  describe("choosing among several matches", () => {
    const entryIn = (version?: string) => ({
      name: "sample-plugin",
      source: { kind: "local", path: PLUGIN_FIXTURE },
      ...(version === undefined ? {} : { version }),
    });

    it("lets an interactive user pick among the marketplaces that match", async () => {
      const prompter = new ChoosingPrompter("mkt2 — ?");
      const { useCase, deps, registry } = await buildUseCase({ prompter });
      seedMarketplaceFile(deps.fs, MKT1_DIR, [entryIn("1.0.0")]);
      seedMarketplaceFile(deps.fs, MKT2_DIR, [entryIn()]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);
      await saveLocalMarketplace(registry, "mkt2", MKT2_DIR);

      const result = await useCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(result.marketplace.name).toBe("mkt2");
      expect(prompter.selectCalls).toStrictEqual([
        {
          message: "Multiple matches for 'sample-plugin'. Select one:",
          choiceNames: ["mkt1 — 1.0.0", "mkt2 — ?"],
        },
      ]);
    });

    it("names every matching marketplace when refusing a non-interactive install", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      seedMarketplaceFile(deps.fs, MKT1_DIR, [entryIn("1.0.0")]);
      seedMarketplaceFile(deps.fs, MKT2_DIR, [entryIn("1.0.0")]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);
      await saveLocalMarketplace(registry, "mkt2", MKT2_DIR);

      await expect(
        useCase.execute({
          pluginName: "sample-plugin",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).rejects.toThrow(
        "Plugin 'sample-plugin' matches multiple marketplaces: mkt1, mkt2. Use --from <marketplace>."
      );
    });

    it("matches a catalog entry by name alone", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        { name: "extra-plugin", source: { kind: "local", path: EXTRA_PLUGIN_FIXTURE } },
        entryIn("1.0.0"),
      ]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);

      const result = await useCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(result.entry.name).toBe("sample-plugin");
    });

    it("passes over a marketplace that has no catalog", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      seedMarketplaceFile(deps.fs, MKT1_DIR, [entryIn("1.0.0")]);
      await saveLocalMarketplace(registry, "no-catalog", "/no-catalog");
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);

      const result = await useCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(result.marketplace.name).toBe("mkt1");
    });
  });

  describe("requested version against the catalog", () => {
    it("accepts a requested version equal to the catalog's", async () => {
      const { useCase, deps, registry } = await buildUseCase();
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
        },
      ]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);

      await useCase.execute({
        pluginName: "sample-plugin",
        version: "1.0.0",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(installedSamplePlugin(deps)?.version).toBe("1.0.0");
    });

    it("logs nothing under prefer-catalog when no version was requested", async () => {
      const logger = new CapturingLogger();
      const { useCase, deps, registry } = await buildUseCase({ logger });
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "2.0.0",
        },
      ]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);

      await useCase.execute({
        pluginName: "sample-plugin",
        requestedVersionPolicy: "prefer-catalog",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(logger.allMessages).toStrictEqual([]);
    });

    it("tolerates having no logger when the catalog version differs under prefer-catalog", async () => {
      const { useCase, deps, registry } = await buildUseCase({ logger: null });
      seedMarketplaceFile(deps.fs, MKT1_DIR, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "2.0.0",
        },
      ]);
      await saveLocalMarketplace(registry, "mkt1", MKT1_DIR);

      await useCase.execute({
        pluginName: "sample-plugin",
        version: "1.0.0",
        requestedVersionPolicy: "prefer-catalog",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(installedSamplePlugin(deps)?.marketplace).toBe("mkt1");
    });
  });
});
