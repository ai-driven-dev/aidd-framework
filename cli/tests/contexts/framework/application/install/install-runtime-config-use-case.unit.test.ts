import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallRuntimeConfigUseCase } from "../../../../../src/contexts/framework/application/install/install-runtime-config-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { SettingsCapability } from "../../../../../src/contexts/tools/domain/capabilities/settings-capability.js";
import { cursor } from "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { registerTool } from "../../../../../src/contexts/tools/domain/registry.js";
import { extractMergeEntries } from "../../../../../src/kernel/merge.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import {
  buildUnitDeps,
  initProject,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";
import { StubAssetProvider } from "../../../../helpers/ports/stub-asset-provider.js";

const PROJECT_ROOT = "/test-project";

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  assets: AssetProvider = deps.assetProvider
) {
  return new InstallRuntimeConfigUseCase(
    deps.fs,
    deps.hasher,
    deps.logger,
    assets,
    deps.postInstallPipelineUseCase
  );
}

describe("InstallRuntimeConfigUseCase", () => {
  it("writes config on fresh install", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    const result = await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(deps.fs.has(join(PROJECT_ROOT, ".claude/settings.json"))).toBe(true);

    const saved = await deps.manifestRepo.load();
    expect(saved?.hasTool("claude")).toBe(true);
  });

  it("returns skipped without writing when already installed and no force", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    const reloaded = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest: reloaded,
      force: false,
      version: "1.0.0",
    });

    expect(result).toStrictEqual({
      toolId: "claude",
      fileCount: 0,
      files: [],
      skipped: true,
      warnings: [],
    });
  });

  it("tracks a file the caller chose to skip under the hash it has on disk", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude");
    const userContent = '{"user": true}';
    await deps.fs.writeFile(join(PROJECT_ROOT, ".claude/settings.json"), userContent);

    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: true,
      version: "1.0.0",
      onBeforeWriteRegularFile: async () => "skip",
    });

    expect(deps.fs.getFile(join(PROJECT_ROOT, ".claude/settings.json"))).toBe(userContent);
    expect(manifest.getToolFiles("claude")).toStrictEqual([
      { relativePath: ".claude/settings.json", hash: deps.hasher.hash(userContent) },
    ]);
  });

  it("overwrites existing tracked files when force is true", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    const settingsPath = join(PROJECT_ROOT, ".claude/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    const reloaded = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest: reloaded,
      force: true,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    const content = deps.fs.getFile(settingsPath) ?? "";
    expect(content).not.toContain('"modified"');
  });

  it("skips user-owned untracked config file and emits warning", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);

    await deps.fs.writeFile(join(PROJECT_ROOT, ".claude/settings.json"), '{"user": true}');

    const warnSpy = vi.spyOn(deps.logger, "warn");
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    const settingsTracked = result.files.some((f) => f.relativePath === ".claude/settings.json");
    expect(settingsTracked).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(".claude/settings.json"));
  });

  describe("copilot requiresTool gate", () => {
    it("does not create .vscode/settings.json when vscode is not installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

      await buildUseCase(deps).execute({
        toolId: "copilot",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: "1.0.0",
      });

      expect(deps.fs.has(join(PROJECT_ROOT, ".vscode/settings.json"))).toBe(false);
    });

    it("creates .vscode/settings.json with copilot keys when vscode is already installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

      await buildUseCase(deps).execute({
        toolId: "copilot",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: "1.0.0",
      });

      expect(deps.fs.has(join(PROJECT_ROOT, ".vscode/settings.json"))).toBe(true);
      const content = deps.fs.getFile(join(PROJECT_ROOT, ".vscode/settings.json")) ?? "";
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed).toHaveProperty("github.copilot.enable");
      expect(parsed).toHaveProperty("chat.plugins.enabled", true);
    });

    it("records the merged settings file with a hash per top-level key", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");
      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

      await buildUseCase(deps).execute({
        toolId: "copilot",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: "1.0.0",
      });

      const onDisk = deps.fs.getFile(join(PROJECT_ROOT, ".vscode/settings.json")) ?? "";
      expect(manifest.getMergeFiles("copilot")).toStrictEqual([
        {
          relativePath: ".vscode/settings.json",
          sectionKey: null,
          entries: extractMergeEntries(onDisk, null, deps.hasher),
        },
      ]);
    });
  });

  describe("static settings declared by the tool", () => {
    const inline = new SettingsCapability({
      outputPath: ".cursor/aidd-static.json",
      mergeStrategy: "framework-prime",
      staticContent: '{"static": true}',
    });
    const consumesOnly = new SettingsCapability({
      outputPath: ".cursor/consumed.json",
      mergeStrategy: "user-prime",
      consumes: ["something"],
    });
    const fromAsset = new SettingsCapability({
      outputPath: ".cursor/from-asset.json",
      mergeStrategy: "framework-prime",
      staticContentAssetFile: "static.json",
    });

    function registerCursorWith(settings: SettingsCapability[]): void {
      registerTool({ ...cursor, capabilities: { ...cursor.capabilities, settings } });
    }

    afterEach(() => {
      registerTool(cursor);
    });

    it("writes inline content and passes over a capability that only consumes", async () => {
      registerCursorWith([inline, consumesOnly]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

      const result = await buildUseCase(deps).execute({
        toolId: "cursor",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: "1.0.0",
      });

      const written = deps.fs.getFile(join(PROJECT_ROOT, ".cursor/aidd-static.json")) ?? "";
      expect(JSON.parse(written)).toStrictEqual({ static: true });
      expect(deps.fs.has(join(PROJECT_ROOT, ".cursor/consumed.json"))).toBe(false);
      expect(result.files.map((f) => f.relativePath)).toStrictEqual([
        ".cursor/settings.json",
        ".cursor/aidd-static.json",
      ]);
    });

    it("writes an asset answered as text verbatim", async () => {
      registerCursorWith([fromAsset]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      const assets = new StubAssetProvider(
        { "cursor/static.json": '{"fromAsset": true}' },
        deps.assetProvider
      );

      await buildUseCase(deps, assets).execute({
        toolId: "cursor",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: "1.0.0",
      });

      const written = deps.fs.getFile(join(PROJECT_ROOT, ".cursor/from-asset.json")) ?? "";
      expect(JSON.parse(written)).toStrictEqual({ fromAsset: true });
    });
  });
});
