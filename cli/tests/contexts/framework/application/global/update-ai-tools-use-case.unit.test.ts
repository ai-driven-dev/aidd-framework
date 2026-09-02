import { describe, expect, it, vi } from "vitest";
import { ResolveUpdateDecisionUseCase } from "../../../../../src/contexts/framework/application/global/resolve-update-decision-use-case.js";
import { UpdateAiToolsUseCase } from "../../../../../src/contexts/framework/application/global/update-ai-tools-use-case.js";
import { UpdateOneToolUseCase } from "../../../../../src/contexts/framework/application/global/update-one-tool-use-case.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import { SyncConflictResolverUseCase } from "../../../../../src/presentation/prompts/sync-conflict-resolver-use-case.js";
import {
  buildUnitDeps,
  buildUpdateOneToolUseCase,
  initProject,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

const NO_FORCE_TTY = { userForce: false, interactive: false };

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  updateOneTool: UpdateOneToolUseCase
): UpdateAiToolsUseCase {
  return new UpdateAiToolsUseCase(deps.manifestRepo, deps.currentVersionProvider, updateOneTool);
}

describe("UpdateAiToolsUseCase", () => {
  describe("empty manifest", () => {
    it("returns empty result when no AI tools are installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const updateOneTool = buildUpdateOneToolUseCase(deps);
      const useCase = buildUseCase(deps, updateOneTool);

      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, ...NO_FORCE_TTY });

      expect(result.updatedTools).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("single toolArg", () => {
    it("updates only the specified tool when toolArg is provided", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude");
      await installTool(deps, PROJECT_ROOT, "cursor");

      const updateOneTool = buildUpdateOneToolUseCase(deps);
      const useCase = buildUseCase(deps, updateOneTool);

      const result = await useCase.execute({
        toolArg: "claude",
        projectRoot: PROJECT_ROOT,
        ...NO_FORCE_TTY,
      });

      expect(result.updatedTools).toHaveLength(1);
      expect(result.updatedTools[0].toolId).toBe("claude");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("partial failure", () => {
    it("captures failing tool in errors and succeeds for others", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude");
      await installTool(deps, PROJECT_ROOT, "cursor");

      const updateOneTool = buildUpdateOneToolUseCase(deps);
      const executeSpy = vi.spyOn(updateOneTool, "execute");
      executeSpy.mockImplementation(
        async (toolId, _manifest, _projectRoot, _version, errors, _options) => {
          if (toolId === "cursor") {
            errors.push({ scope: "cursor", message: "cursor update failed" });
            return null;
          }
          return { toolId, fileCount: 3 };
        }
      );

      const useCase = buildUseCase(deps, updateOneTool);
      const result = await useCase.execute({ projectRoot: PROJECT_ROOT, ...NO_FORCE_TTY });

      expect(result.updatedTools).toHaveLength(1);
      expect(result.updatedTools[0].toolId).toBe("claude");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].scope).toBe("cursor");
      expect(result.errors[0].message).toBe("cursor update failed");
    });
  });

  describe("bulk state: cross-tool persistence", () => {
    it("resolveConflictBulk called once for overwrite-all then not again for second tool", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude");
      await installTool(deps, PROJECT_ROOT, "cursor");

      const resolveConflictBulkMock = vi.fn().mockResolvedValueOnce("overwrite-all");
      const fakePrompter: Prompter = {
        resolveConflict: vi.fn(),
        resolveConflictBulk: resolveConflictBulkMock,
        confirm: vi.fn(),
        input: vi.fn(),
        select: vi.fn(),
        checkbox: vi.fn(),
      } as unknown as Prompter;

      const conflictResolver = new SyncConflictResolverUseCase(deps.fs);
      const decisionUseCase = new ResolveUpdateDecisionUseCase(fakePrompter);
      const updateOneTool = new UpdateOneToolUseCase(
        deps.installRuntimeConfigUseCase,
        deps.installIdeConfigUseCase,
        conflictResolver,
        decisionUseCase,
        deps.fs
      );
      const useCase = new UpdateAiToolsUseCase(
        deps.manifestRepo,
        deps.currentVersionProvider,
        updateOneTool
      );

      // Modify the first tracked file of each tool to trigger conflict
      const loadedManifest = await deps.manifestRepo.load();
      if (!loadedManifest) throw new Error("Manifest not found");
      for (const toolId of ["claude", "cursor"] as const) {
        const files = loadedManifest.getToolFiles(toolId);
        if (files.length > 0 && files[0]) {
          await deps.fs.writeFile(`${PROJECT_ROOT}/${files[0].relativePath}`, "user-modified");
        }
      }

      await useCase.execute({ projectRoot: PROJECT_ROOT, userForce: false, interactive: true });

      // Bulk prompt called exactly once — second tool reuses the bulk state
      expect(resolveConflictBulkMock).toHaveBeenCalledTimes(1);
    });
  });
});
