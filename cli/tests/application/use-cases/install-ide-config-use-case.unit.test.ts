import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InstallIdeConfigUseCase } from "../../../src/application/use-cases/install/install-ide-config-use-case.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { buildUnitDeps, initProject } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

function buildUseCase(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  return new InstallIdeConfigUseCase(
    deps.fs,
    deps.hasher,
    deps.logger,
    deps.assetProvider,
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
    expect(deps.fs.has(join(PROJECT_ROOT, ".vscode/settings.json"))).toBe(true);

    const saved = await deps.manifestRepo.load();
    expect(saved?.hasTool("vscode")).toBe(true);
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
    // user-prime strategy preserves user modifications on force reinstall
    expect(content).toContain('"modified"');
    // framework keys are also present
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
