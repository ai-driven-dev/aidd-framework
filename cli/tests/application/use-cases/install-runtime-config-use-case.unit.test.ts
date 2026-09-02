import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InstallRuntimeConfigUseCase } from "../../../src/application/use-cases/install/install-runtime-config-use-case.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { buildUnitDeps, initProject, installTool } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

function buildUseCase(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  return new InstallRuntimeConfigUseCase(
    deps.fs,
    deps.hasher,
    deps.logger,
    deps.assetProvider,
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

    expect(result.skipped).toBe(true);
    expect(result.fileCount).toBe(0);
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

  it("does not create kilo.json next to an existing kilo.jsonc", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await deps.fs.writeFile(join(PROJECT_ROOT, "kilo.jsonc"), '{ "model": "kilo/default" }');

    const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
    await buildUseCase(deps).execute({
      toolId: "kilo",
      projectRoot: PROJECT_ROOT,
      manifest,
      force: false,
      version: "1.0.0",
    });

    expect(deps.fs.has(join(PROJECT_ROOT, "kilo.json"))).toBe(false);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "kilo.jsonc"))).toContain("kilo/default");
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
  });
});
