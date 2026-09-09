import { describe, expect, it } from "vitest";
import { DoctorAllUseCase } from "../../../../../src/contexts/framework/application/global/doctor-all-use-case.js";
import type { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import {
  buildDoctorUseCase,
  buildUnitDeps,
  initAndInstall,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";
const NO_MANIFEST = "No AIDD manifest found. Run `aidd setup` to initialize your project.";
const PLUGIN_FILE = ".claude/plugins/sample/agents/reviewer.md";

async function depsWithBothCategories() {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initAndInstall(deps, PROJECT_ROOT, "claude");
  await installTool(deps, PROJECT_ROOT, "vscode");
  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("manifest missing");
  return { deps, manifest };
}

function healthOf(manifest: Manifest, toolId: ToolId) {
  return {
    toolId,
    fileCount: manifest.getToolFiles(toolId).length,
    mergeFileCount: manifest.getMergeFiles(toolId).length,
  };
}

async function deleteOneTrackedFile(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  manifest: Manifest,
  toolId: ToolId
) {
  const [first] = manifest.getToolFiles(toolId);
  if (first === undefined) throw new Error(`${toolId} tracks no file`);
  await deps.fs.deleteFile(`${PROJECT_ROOT}/${first.relativePath}`);
}

function verdictOf(result: Awaited<ReturnType<DoctorAllUseCase["execute"]>>) {
  return [result.healthy, result.ai?.healthy, result.ide?.healthy, result.errors];
}

describe("DoctorAllUseCase", () => {
  it("records one error per scope, and no report, when no manifest exists", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const useCase = new DoctorAllUseCase(buildDoctorUseCase(deps));

    const result = await useCase.execute(PROJECT_ROOT);

    expect(result).toStrictEqual({
      ai: null,
      ide: null,
      pluginIssues: [],
      healthy: false,
      errors: [
        { scope: "ai", message: NO_MANIFEST },
        { scope: "ide", message: NO_MANIFEST },
      ],
    });
  });

  it("is healthy with one report per category when every tool is in sync", async () => {
    const { deps, manifest } = await depsWithBothCategories();
    const useCase = new DoctorAllUseCase(buildDoctorUseCase(deps));

    const result = await useCase.execute(PROJECT_ROOT);

    expect(result).toStrictEqual({
      ai: {
        healthy: true,
        toolHealth: [healthOf(manifest, "claude")],
        issues: [],
        pluginIssues: [],
      },
      ide: {
        healthy: true,
        toolHealth: [healthOf(manifest, "vscode")],
        issues: [],
        pluginIssues: [],
      },
      pluginIssues: [],
      healthy: true,
      errors: [],
    });
  });

  it("is not healthy when the ai scope alone found a fault", async () => {
    const { deps, manifest } = await depsWithBothCategories();
    await deleteOneTrackedFile(deps, manifest, "claude");
    const useCase = new DoctorAllUseCase(buildDoctorUseCase(deps));

    const result = await useCase.execute(PROJECT_ROOT);

    expect(verdictOf(result)).toStrictEqual([false, false, true, []]);
  });

  it("is not healthy when the ide scope alone found a fault", async () => {
    const { deps, manifest } = await depsWithBothCategories();
    await deleteOneTrackedFile(deps, manifest, "vscode");
    const useCase = new DoctorAllUseCase(buildDoctorUseCase(deps));

    const result = await useCase.execute(PROJECT_ROOT);

    expect(verdictOf(result)).toStrictEqual([false, true, false, []]);
  });

  it("carries the ai scope's plugin issues", async () => {
    const { deps, manifest } = await depsWithBothCategories();
    manifest.addPlugin(
      "claude",
      InstalledPlugin.fromJSON({
        name: "sample",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { [PLUGIN_FILE]: "abc123abc123abc123abc123abc123ab" },
        scope: "project",
      })
    );
    await deps.manifestRepo.save(manifest);
    const useCase = new DoctorAllUseCase(buildDoctorUseCase(deps));

    const result = await useCase.execute(PROJECT_ROOT);

    const missing = {
      toolId: "claude",
      pluginName: "sample",
      issue: "missing",
      filePath: PLUGIN_FILE,
    };
    expect([result.pluginIssues, result.ai?.pluginIssues, result.healthy]).toStrictEqual([
      [missing],
      [missing],
      false,
    ]);
  });
});
