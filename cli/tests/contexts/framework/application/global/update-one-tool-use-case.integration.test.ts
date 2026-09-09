import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BulkConflictState,
  ResolveUpdateDecisionUseCase,
} from "../../../../../src/contexts/framework/application/global/resolve-update-decision-use-case.js";
import { UpdateOneToolUseCase } from "../../../../../src/contexts/framework/application/global/update-one-tool-use-case.js";
import type { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InputRequiredError } from "../../../../../src/kernel/errors.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import { SyncConflictResolverUseCase } from "../../../../../src/presentation/prompts/sync-conflict-resolver-use-case.js";
import {
  buildUnitDeps,
  initAndInstall,
  initProject,
  installTool,
} from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

function buildFakePrompter(answer: "keep" | "overwrite" | "overwrite-all" | "skip-all"): Prompter {
  return {
    resolveConflict: vi.fn(),
    resolveConflictBulk: vi.fn().mockResolvedValue(answer),
    confirm: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    checkbox: vi.fn(),
  };
}

function buildUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  prompter: Prompter
): UpdateOneToolUseCase {
  const conflictResolver = new SyncConflictResolverUseCase(deps.fs);
  const decisionUseCase = new ResolveUpdateDecisionUseCase(prompter);
  return new UpdateOneToolUseCase(
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase,
    conflictResolver,
    decisionUseCase,
    deps.fs
  );
}

async function loadManifest(deps: Awaited<ReturnType<typeof buildUnitDeps>>): Promise<Manifest> {
  const m = await deps.manifestRepo.load();
  if (!m) throw new Error("Manifest not found");
  return m;
}

async function modifyFile(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  relativePath: string,
  projectRoot: string
): Promise<void> {
  await deps.fs.writeFile(join(projectRoot, relativePath), "user-modified content");
}

describe("UpdateOneToolUseCase integration", () => {
  describe("unmodified file", () => {
    it("writes the file without prompting", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter = buildFakePrompter("keep");
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = await loadManifest(deps);
      const errors: Parameters<typeof UpdateOneToolUseCase.prototype.execute>[4] = [];

      const result = await buildUseCase(deps, prompter).execute(
        "claude",
        manifest,
        PROJECT_ROOT,
        "test",
        errors,
        { userForce: false, interactive: false, bulkState: new BulkConflictState() }
      );

      expect(result).not.toBeNull();
      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
      expect(errors).toHaveLength(0);
    });
  });

  describe("modified file + force", () => {
    it("overwrites without prompting", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter = buildFakePrompter("keep");
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = await loadManifest(deps);
      const firstFile = manifest.getToolFiles("claude")[0];
      expect(firstFile).toBeDefined();
      if (!firstFile) return;
      await modifyFile(deps, firstFile.relativePath, PROJECT_ROOT);

      const useCase = buildUseCase(deps, prompter);
      const errors: Parameters<typeof useCase.execute>[4] = [];
      const result = await useCase.execute("claude", manifest, PROJECT_ROOT, "test", errors, {
        userForce: true,
        interactive: false,
        bulkState: new BulkConflictState(),
      });

      expect(result).not.toBeNull();
      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
      expect(errors).toHaveLength(0);
    });
  });

  describe("modified file + non-TTY + no force", () => {
    it("throws InputRequiredError (not caught by aggregation)", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter = buildFakePrompter("keep");
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = await loadManifest(deps);
      const firstFile = manifest.getToolFiles("claude")[0];
      expect(firstFile).toBeDefined();
      if (!firstFile) return;
      await modifyFile(deps, firstFile.relativePath, PROJECT_ROOT);

      const useCase = buildUseCase(deps, prompter);
      const errors: Parameters<typeof useCase.execute>[4] = [];

      await expect(
        useCase.execute("claude", manifest, PROJECT_ROOT, "test", errors, {
          userForce: false,
          interactive: false,
          bulkState: new BulkConflictState(),
        })
      ).rejects.toThrow(InputRequiredError);

      expect(errors).toHaveLength(0);
    });
  });

  describe("install failure", () => {
    it("reports the failure and returns null instead of throwing", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      vi.spyOn(deps.installRuntimeConfigUseCase, "execute").mockRejectedValue(
        new Error("disk full")
      );

      const useCase = buildUseCase(deps, buildFakePrompter("keep"));
      const errors: Parameters<typeof useCase.execute>[4] = [];

      const result = await useCase.execute(
        "claude",
        await loadManifest(deps),
        PROJECT_ROOT,
        "test",
        errors,
        { userForce: false, interactive: false, bulkState: new BulkConflictState() }
      );

      expect(result).toBeNull();
      expect(errors).toEqual([{ scope: "claude", message: "disk full" }]);
    });

    it("reports a non-Error rejection as a string", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      vi.spyOn(deps.installRuntimeConfigUseCase, "execute").mockRejectedValue("plain string");

      const useCase = buildUseCase(deps, buildFakePrompter("keep"));
      const errors: Parameters<typeof useCase.execute>[4] = [];

      const result = await useCase.execute(
        "claude",
        await loadManifest(deps),
        PROJECT_ROOT,
        "test",
        errors,
        { userForce: false, interactive: false, bulkState: new BulkConflictState() }
      );

      expect(result).toBeNull();
      expect(errors).toEqual([{ scope: "claude", message: "plain string" }]);
    });
  });

  describe("modified file + TTY + keep", () => {
    it("skips the file and preserves user edit when prompter returns keep", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter = buildFakePrompter("keep");
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = await loadManifest(deps);
      const firstFile = manifest.getToolFiles("claude")[0];
      expect(firstFile).toBeDefined();
      if (!firstFile) return;
      const userContent = "user-modified content";
      await modifyFile(deps, firstFile.relativePath, PROJECT_ROOT);

      const useCase = buildUseCase(deps, prompter);
      const errors: Parameters<typeof useCase.execute>[4] = [];
      await useCase.execute("claude", manifest, PROJECT_ROOT, "test", errors, {
        userForce: false,
        interactive: true,
        bulkState: new BulkConflictState(),
      });

      const diskContent = await deps.fs.readFile(join(PROJECT_ROOT, firstFile.relativePath));
      expect(diskContent).toBe(userContent);
      expect(prompter.resolveConflictBulk).toHaveBeenCalledWith(firstFile.relativePath, "modified");
    });
  });

  describe("modified file + TTY + overwrite", () => {
    it("writes the file and prompter was called", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter = buildFakePrompter("overwrite");
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const manifest = await loadManifest(deps);
      const firstFile = manifest.getToolFiles("claude")[0];
      expect(firstFile).toBeDefined();
      if (!firstFile) return;
      await modifyFile(deps, firstFile.relativePath, PROJECT_ROOT);

      const useCase = buildUseCase(deps, prompter);
      const errors: Parameters<typeof useCase.execute>[4] = [];
      const result = await useCase.execute("claude", manifest, PROJECT_ROOT, "test", errors, {
        userForce: false,
        interactive: true,
        bulkState: new BulkConflictState(),
      });

      expect(result).not.toBeNull();
      expect(prompter.resolveConflictBulk).toHaveBeenCalledWith(firstFile.relativePath, "modified");
      expect(errors).toHaveLength(0);
    });
  });

  describe("scope A: updatePlugins/refreshMarketplaces signatures unchanged", () => {
    it("UpdateOneToolUseCase has no plugin or marketplace update method", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude");
      const useCase = buildUseCase(deps, buildFakePrompter("keep"));
      expect(typeof useCase.execute).toBe("function");
      expect("updatePlugins" in useCase).toBe(false);
      expect("refreshMarketplaces" in useCase).toBe(false);
    });
  });
});
