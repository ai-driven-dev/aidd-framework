import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { UninstallUseCase } from "../../../../src/contexts/framework/application/uninstall/uninstall-use-case.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps, initProject, installTool } from "../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("uninstall", () => {
  it("no longer tracks removed tool files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude" as ToolId);

    const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
    await useCase.execute({
      toolIds: ["claude" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
    });

    const manifest = await deps.manifestRepo.load();
    expect(manifest?.getInstalledToolIds()).not.toContain("claude");
  });

  it("completes without error when files were already deleted from disk", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude" as ToolId);

    // Delete .claude/ files from in-memory FS
    const claudeFiles = deps.fs.listUnder(join(PROJECT_ROOT, ".claude"));
    for (const f of claudeFiles) {
      await deps.fs.deleteFile(f);
    }

    const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
    await expect(
      useCase.execute({ toolIds: ["claude" as ToolId], projectRoot: PROJECT_ROOT, mcpFilter: [] })
    ).resolves.not.toThrow();
  });

  it("does not delete shared files when one of two tools sharing them is uninstalled", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude" as ToolId);
    await installTool(deps, PROJECT_ROOT, "vscode" as ToolId);

    const sharedFile = join(PROJECT_ROOT, ".vscode", "settings.json");
    expect(deps.fs.has(sharedFile)).toBe(true);

    const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
    await useCase.execute({
      toolIds: ["claude" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
    });

    expect(deps.fs.has(sharedFile)).toBe(true);
  });

  describe("user-prime merge files", () => {
    it("deletes settings.json when empty after stripping all AIDD-managed keys", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode" as ToolId);

      const settingsPath = join(PROJECT_ROOT, ".vscode", "settings.json");
      expect(deps.fs.has(settingsPath)).toBe(true);

      const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
      await useCase.execute({
        toolIds: ["vscode" as ToolId],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      });

      expect(deps.fs.has(settingsPath)).toBe(false);
    });

    it("deletes keybindings.json on uninstall — whole-file ownership, no zombie", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode" as ToolId);

      const keybindingsPath = join(PROJECT_ROOT, ".vscode", "keybindings.json");
      expect(deps.fs.has(keybindingsPath)).toBe(true);

      const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
      await useCase.execute({
        toolIds: ["vscode" as ToolId],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      });

      expect(deps.fs.has(keybindingsPath)).toBe(false);
    });
  });

  describe("MCP removal", () => {
    it("full tool removal still works without mcpFilter", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude" as ToolId);

      const useCase = new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger);
      await useCase.execute({
        toolIds: ["claude" as ToolId],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      });

      const manifest = await deps.manifestRepo.load();
      expect(manifest?.getInstalledToolIds()).not.toContain("claude");
    });
  });
});
