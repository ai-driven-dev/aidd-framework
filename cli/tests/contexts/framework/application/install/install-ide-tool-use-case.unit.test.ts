import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InstallIdeToolUseCase } from "../../../../../src/contexts/framework/application/install/install-ide-tool-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import {
  buildUnitDeps,
  initAndInstall,
  initProject,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";
const VERSION = "1.0.0";

function buildUseCase(deps: Awaited<ReturnType<typeof buildUnitDeps>>) {
  return new InstallIdeToolUseCase(
    deps.installIdeConfigUseCase,
    deps.manifestRepo,
    deps.fs,
    deps.hasher,
    deps.postInstallPipelineUseCase,
    deps.assetProvider
  );
}

describe("InstallIdeToolUseCase", () => {
  describe("copilot installed before vscode", () => {
    it("merges copilot static keys into .vscode/settings.json when vscode is installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "copilot");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      const result = await buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      expect(result.skipped).toBe(false);
      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      const content = deps.fs.getFile(settingsPath) ?? "";
      expect(content).toContain('"github.copilot.enable"');
      expect(content).toContain('"editor.formatOnSave"');
    });

    it("tracks copilot's vscode merge entries in manifest after install", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "copilot");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      await buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      const saved = await deps.manifestRepo.load();
      const mergeFiles = saved?.getMergeFiles("copilot") ?? [];
      const hasSettingsEntry = mergeFiles.some((m) => m.relativePath === ".vscode/settings.json");
      expect(hasSettingsEntry).toBe(true);
    });
  });

  describe("no AI tool depends on the installing IDE", () => {
    it("performs only the IDE install with no extra mergeJsonFile calls for copilot settings", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      const result = await buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      expect(result.skipped).toBe(false);
      // Claude declares no static settings with `requiresTool: vscode`.
      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      const content = deps.fs.getFile(settingsPath) ?? "";
      expect(content).not.toContain('"github.copilot.enable"');
      expect(content).toContain('"editor.formatOnSave"');
    });
  });

  describe("IDE already installed (skipped)", () => {
    it("returns skipped and does not re-propagate AI settings", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");
      await installTool(deps, PROJECT_ROOT, "copilot");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      const result = await buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      expect(result.skipped).toBe(true);
    });
  });

  describe("integration: copilot then vscode — full end state", () => {
    it("settings.json has both copilot and vscode keys", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "copilot");

      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      await buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      const content = deps.fs.getFile(settingsPath) ?? "";
      expect(content).toContain('"github.copilot.enable"');
      expect(content).toContain('"github.copilot.nextEditSuggestions.enabled"');
      expect(content).toContain('"editor.formatOnSave"');
    });
  });
});
