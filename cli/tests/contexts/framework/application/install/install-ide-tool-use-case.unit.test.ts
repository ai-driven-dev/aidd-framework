import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InstallIdeToolUseCase } from "../../../../../src/contexts/framework/application/install/install-ide-tool-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { SettingsCapability } from "../../../../../src/contexts/tools/domain/capabilities/settings-capability.js";
import { cursor } from "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { registerTool } from "../../../../../src/contexts/tools/domain/registry.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import {
  buildUnitDeps,
  initAndInstall,
  initProject,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";
import { StubAssetProvider } from "../../../../helpers/ports/stub-asset-provider.js";

const PROJECT_ROOT = "/test-project";
const VERSION = "1.0.0";

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  assetProvider: AssetProvider | null = deps.assetProvider
) {
  return new InstallIdeToolUseCase(
    deps.installIdeConfigUseCase,
    deps.manifestRepo,
    deps.fs,
    deps.hasher,
    deps.postInstallPipelineUseCase,
    assetProvider ?? undefined
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

  describe("selecting what an installed AI tool declares for the IDE", () => {
    const forIde = new SettingsCapability({
      outputPath: ".vscode/aidd-a.json",
      mergeStrategy: "framework-prime",
      staticContent: '{"a": 1}',
      requiresTool: "vscode",
    });
    const consumesOnly = new SettingsCapability({
      outputPath: ".vscode/aidd-b.json",
      mergeStrategy: "user-prime",
      consumes: ["something"],
    });
    const forItself = new SettingsCapability({
      outputPath: ".cursor/aidd-c.json",
      mergeStrategy: "framework-prime",
      staticContent: '{"c": 1}',
    });
    const fromAsset = new SettingsCapability({
      outputPath: ".vscode/aidd-d.json",
      mergeStrategy: "framework-prime",
      staticContentAssetFile: "d.json",
      requiresTool: "vscode",
    });

    function registerCursorWith(settings: SettingsCapability[]): void {
      registerTool({ ...cursor, capabilities: { ...cursor.capabilities, settings } });
    }

    afterEach(() => {
      registerTool(cursor);
    });

    async function withCursorRegistered(
      deps: Awaited<ReturnType<typeof buildUnitDeps>>,
      mergeFiles: Parameters<Manifest["addTool"]>[3] = []
    ): Promise<Manifest> {
      const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
      manifest.addTool("cursor", VERSION, [], mergeFiles);
      await deps.manifestRepo.save(manifest);
      return manifest;
    }

    async function installVscode(
      deps: Awaited<ReturnType<typeof buildUnitDeps>>,
      manifest: Manifest
    ) {
      return buildUseCase(deps).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });
    }

    function parsed(deps: Awaited<ReturnType<typeof buildUnitDeps>>, relativePath: string) {
      return JSON.parse(deps.fs.getFile(join(PROJECT_ROOT, relativePath)) ?? "");
    }

    it("merges only the static settings that name this IDE", async () => {
      registerCursorWith([forIde, consumesOnly, forItself]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = await withCursorRegistered(deps);

      await installVscode(deps, manifest);

      expect(parsed(deps, ".vscode/aidd-a.json")).toStrictEqual({ a: 1 });
      expect(deps.fs.has(join(PROJECT_ROOT, ".vscode/aidd-b.json"))).toBe(false);
      expect(deps.fs.has(join(PROJECT_ROOT, ".cursor/aidd-c.json"))).toBe(false);
    });

    it("keeps the tool's other merge entries and replaces a stale one for the same file", async () => {
      registerCursorWith([forIde]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const mcpEntry = { relativePath: ".cursor/mcp.json", sectionKey: null, entries: {} };
      const stale = {
        relativePath: ".vscode/aidd-a.json",
        sectionKey: null,
        entries: { stale: deps.hasher.hash("0") },
      };
      const manifest = await withCursorRegistered(deps, [mcpEntry, stale]);

      await installVscode(deps, manifest);

      expect(manifest.getMergeFiles("cursor")).toStrictEqual([
        mcpEntry,
        {
          relativePath: ".vscode/aidd-a.json",
          sectionKey: null,
          entries: { a: deps.hasher.hash("1") },
        },
      ]);
    });

    it("leaves a hand-edited file alone when the IDE was already installed", async () => {
      registerCursorWith([forIde]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");
      const manifest = await withCursorRegistered(deps);
      await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/aidd-a.json"), '{"user": true}');

      const result = await installVscode(deps, manifest);

      expect(result.skipped).toBe(true);
      expect(deps.fs.getFile(join(PROJECT_ROOT, ".vscode/aidd-a.json"))).toBe('{"user": true}');
    });

    it("writes an asset answered as text verbatim", async () => {
      registerCursorWith([fromAsset]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = await withCursorRegistered(deps);
      const assets = new StubAssetProvider({ "cursor/d.json": '{"d": 1}' });

      await buildUseCase(deps, assets).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      expect(parsed(deps, ".vscode/aidd-d.json")).toStrictEqual({ d: 1 });
    });

    it("merges an empty object for an asset-backed capability when no asset provider was given", async () => {
      registerCursorWith([fromAsset]);
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const manifest = await withCursorRegistered(deps);

      await buildUseCase(deps, null).execute({
        toolId: "vscode",
        projectRoot: PROJECT_ROOT,
        manifest,
        force: false,
        version: VERSION,
      });

      expect(parsed(deps, ".vscode/aidd-d.json")).toStrictEqual({});
    });
  });
});
