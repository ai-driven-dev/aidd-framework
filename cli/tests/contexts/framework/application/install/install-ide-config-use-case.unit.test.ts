import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InstallIdeConfigUseCase } from "../../../../../src/contexts/framework/application/install/install-ide-config-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import { buildUnitDeps, initProject } from "../../../../helpers/ports/build-unit-deps.js";
import { StubAssetProvider } from "../../../../helpers/ports/stub-asset-provider.js";

const PROJECT_ROOT = "/test-project";
const KEYBINDINGS = ".vscode/keybindings.json";

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  assets: AssetProvider = deps.assetProvider
) {
  return new InstallIdeConfigUseCase(
    deps.fs,
    deps.hasher,
    deps.logger,
    assets,
    deps.postInstallPipelineUseCase
  );
}

describe("InstallIdeConfigUseCase", () => {
  it("writes settings files on fresh install", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    const result = await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.warnings).toStrictEqual([]);
    expect(deps.fs.has(join(PROJECT_ROOT, ".vscode/settings.json"))).toBe(true);

    const saved = await deps.manifestRepo.load();
    expect(saved?.hasTool("vscode")).toBe(true);
  });

  it("answers an empty skipped result for an installed IDE", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    const result = await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(result).toStrictEqual({
      toolId: "vscode",
      fileCount: 0,
      files: [],
      skipped: true,
      warnings: [],
    });
  });

  it("tracks a file the caller chose to skip under the hash it has on disk", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });
    const userContent = '[{"key": "ctrl+k"}]';
    await deps.fs.writeFile(join(PROJECT_ROOT, KEYBINDINGS), userContent);

    await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: true,
      version: "1.0.0",
      onBeforeWriteRegularFile: async (path) => (path === KEYBINDINGS ? "skip" : "write"),
    });

    expect(deps.fs.getFile(join(PROJECT_ROOT, KEYBINDINGS))).toBe(userContent);
    expect(manifest.getToolFiles("vscode")).toStrictEqual([
      { relativePath: KEYBINDINGS, hash: deps.hasher.hash(userContent) },
    ]);
  });

  it("writes an asset answered as text verbatim", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    const text = '[\n  // user comment\n  {"key": "ctrl+k"}\n]';
    const assets = new StubAssetProvider({ "vscode/keybindings.json": text }, deps.assetProvider);

    await buildUseCase(deps, assets).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(deps.fs.getFile(join(PROJECT_ROOT, KEYBINDINGS))).toBe(text);
  });

  it("returns skipped without writing when already installed and no force", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    const reloaded = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest: reloaded,
      force: false,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(true);
    expect(result.fileCount).toBe(0);
  });

  it("re-runs install when force is true and preserves user-prime keys", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();

    await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    const reloaded = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest: reloaded,
      force: true,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    const content = deps.fs.getFile(settingsPath) ?? "";
    expect(content).toContain('"modified"');
    expect(content).toContain('"editor.formatOnSave"');
  });

  it("skips user-owned untracked settings file and emits warning", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);

    await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/settings.json"), '{"user": true}');

    const warnSpy = vi.spyOn(deps.logger, "warn");
    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    const result = await buildUseCase(deps).execute({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(result.skipped).toBe(false);
    const settingsTracked = result.files.some((f) => f.relativePath === ".vscode/settings.json");
    expect(settingsTracked).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(".vscode/settings.json"));
  });
});
