import { describe, expect, it, vi } from "vitest";
import type { MarketplaceSyncSettings } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { InstallAiToolUseCase } from "../../../../../src/contexts/framework/application/install/install-ai-tool-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import {
  buildUnitDeps,
  initAndInstall,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";
const VERSION = "1.0.0";

function makeMockPlugin(name: string, marketplace = "aidd"): InstalledPlugin {
  return InstalledPlugin.fromJSON({
    name,
    source: { kind: "github", repo: "acme/plugins", ref: "main" },
    version: "1.0.0",
    strict: false,
    files: {},
    scope: "project",
    marketplace,
  });
}

function makeMockOrphanPlugin(name: string): InstalledPlugin {
  return InstalledPlugin.fromJSON({
    name,
    source: { kind: "github", repo: "acme/plugins", ref: "main" },
    version: "1.0.0",
    strict: false,
    files: {},
    scope: "project",
  });
}

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  pluginInstall: Partial<PluginInstallFromMarketplace> = {},
  syncSettings: Partial<MarketplaceSyncSettings> = {}
) {
  const pluginInstallMock: PluginInstallFromMarketplace = {
    execute: vi.fn().mockResolvedValue({ marketplace: {}, entry: {} }),
    ...pluginInstall,
  };
  const syncSettingsMock: MarketplaceSyncSettings = {
    execute: vi.fn().mockResolvedValue({ updatedTools: [] }),
    ...syncSettings,
  };
  return {
    useCase: new InstallAiToolUseCase(
      deps.installRuntimeConfigUseCase,
      deps.manifestRepo,
      pluginInstallMock,
      syncSettingsMock,
      deps.logger
    ),
    pluginInstallMock,
    syncSettingsMock,
  };
}

async function addPlugin(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  toolId: string,
  plugin: InstalledPlugin
): Promise<void> {
  const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
  manifest.addPlugin(toolId as Parameters<typeof manifest.addPlugin>[0], plugin);
  await deps.manifestRepo.save(manifest);
}

describe("InstallAiToolUseCase", () => {
  describe("empty manifest — no prior tools", () => {
    it("installs the tool and returns no propagation when no plugins exist on other tools", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const { useCase } = buildUseCase(deps);

      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.runtimeResult.skipped).toBe(false);
      expect(result.propagatedPlugins).toHaveLength(0);
      expect(result.propagationWarnings).toHaveLength(0);
    });
  });

  describe("manifest with plugins on another tool", () => {
    it("propagates plugins from existing tools onto the new tool", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("my-plugin"));

      const { useCase, pluginInstallMock } = buildUseCase(deps);

      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.propagatedPlugins).toContain("my-plugin");
      expect(pluginInstallMock.execute).toHaveBeenCalledOnce();
      expect(pluginInstallMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginName: "my-plugin",
          toolIds: ["opencode"],
          replace: true,
          autoSelect: true,
        })
      );
    });

    it("runs settings sync after propagation", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("my-plugin"));

      const { useCase, syncSettingsMock } = buildUseCase(deps);
      await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(syncSettingsMock.execute).toHaveBeenCalledOnce();
      expect(syncSettingsMock.execute).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
    });

    it("skips propagation and sync when --no-plugins flag is set", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("my-plugin"));

      const { useCase, pluginInstallMock, syncSettingsMock } = buildUseCase(deps);
      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: false,
      });

      expect(result.propagatedPlugins).toHaveLength(0);
      expect(pluginInstallMock.execute).not.toHaveBeenCalled();
      expect(syncSettingsMock.execute).not.toHaveBeenCalled();
    });

    it("deduplicates plugins appearing on multiple source tools", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      manifest.addTool("cursor", VERSION, []);
      manifest.addPlugin("claude", makeMockPlugin("shared-plugin"));
      manifest.addPlugin("cursor", makeMockPlugin("shared-plugin"));
      await deps.manifestRepo.save(manifest);

      const { useCase, pluginInstallMock } = buildUseCase(deps);
      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.propagatedPlugins).toEqual(["shared-plugin"]);
      expect(pluginInstallMock.execute).toHaveBeenCalledOnce();
    });
  });

  describe("tool already installed (skipped)", () => {
    it("returns skipped without propagation when tool is already installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("some-plugin"));

      // Pre-install opencode so the next orchestrator call will skip
      await installTool(deps, PROJECT_ROOT, "opencode");

      const { useCase, pluginInstallMock } = buildUseCase(deps);
      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.runtimeResult.skipped).toBe(true);
      expect(result.propagatedPlugins).toHaveLength(0);
      expect(pluginInstallMock.execute).not.toHaveBeenCalled();
    });
  });

  describe("orphaned plugin (no marketplace)", () => {
    it("emits a warning and does not throw when plugin has no marketplace", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockOrphanPlugin("orphan-plugin"));

      const warnSpy = vi.spyOn(deps.logger, "warn");
      const { useCase, pluginInstallMock } = buildUseCase(deps);
      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.propagationWarnings).toHaveLength(1);
      expect(result.propagationWarnings[0]).toContain("orphan-plugin");
      expect(pluginInstallMock.execute).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("propagation version policy", () => {
    it("passes prefer-catalog policy to pluginInstallFromMarketplace on propagation", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("my-plugin"));

      const { useCase, pluginInstallMock } = buildUseCase(deps);

      await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(pluginInstallMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({ requestedVersionPolicy: "prefer-catalog" })
      );
    });
  });

  describe("propagation failure", () => {
    it("records a warning and continues when plugin installation fails", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await addPlugin(deps, "claude", makeMockPlugin("fail-plugin"));
      await addPlugin(deps, "claude", makeMockPlugin("ok-plugin"));

      const { useCase } = buildUseCase(deps, {
        execute: vi
          .fn()
          .mockRejectedValueOnce(new Error("catalog unavailable"))
          .mockResolvedValueOnce({ marketplace: {}, entry: {} }),
      });

      const result = await useCase.execute({
        toolId: "opencode",
        projectRoot: PROJECT_ROOT,
        force: false,
        version: VERSION,
        propagatePlugins: true,
      });

      expect(result.propagatedPlugins).toContain("ok-plugin");
      expect(result.propagationWarnings).toHaveLength(1);
      expect(result.propagationWarnings[0]).toContain("fail-plugin");
    });
  });
});
