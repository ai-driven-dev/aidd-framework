import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { UninstallUseCase } from "../../../../src/contexts/framework/application/uninstall/uninstall-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import {
  InputRequiredError,
  NoManifestError,
  ToolNotInstalledError,
} from "../../../../src/kernel/errors.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps, initProject, installTool } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

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

describe("uninstall — refusals", () => {
  it("refuses to remove nothing, naming every tool it knows", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);

    await expect(
      new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger).execute({
        toolIds: [],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      })
    ).rejects.toThrow(
      new InputRequiredError(
        "At least one tool ID is required. Valid tools: claude, cursor, copilot, opencode, codex, vscode"
      )
    );
  });

  it("refuses a project that has no manifest", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);

    await expect(
      new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger).execute({
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      })
    ).rejects.toThrow(NoManifestError);
  });

  it("refuses a tool that is not installed", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);

    await expect(
      new UninstallUseCase(deps.fs, deps.manifestRepo, deps.logger).execute({
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        mcpFilter: [],
      })
    ).rejects.toThrow(ToolNotInstalledError);
  });
});

describe("uninstall — an MCP filter", () => {
  it("strips the named entries and leaves the tool installed", async () => {
    const hasher = new DeterministicHasher();
    const servers = { github: { command: "gh" }, playwright: { command: "npx" } };
    const fs = new InMemoryFileAdapter(
      { [join(PROJECT_ROOT, ".mcp.json")]: JSON.stringify({ mcpServers: servers }) },
      hasher
    );
    const manifest = Manifest.create();
    manifest.addTool(
      "claude",
      "test",
      [],
      [
        {
          relativePath: ".mcp.json",
          sectionKey: "mcpServers",
          entries: {
            github: hasher.hash(JSON.stringify(servers.github)),
            playwright: hasher.hash(JSON.stringify(servers.playwright)),
          },
        },
      ]
    );
    const repo = new InMemoryManifestRepository(manifest);

    const results = await new UninstallUseCase(fs, repo, new CapturingLogger()).execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      mcpFilter: ["github"],
    });

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 1, deletedFiles: ["github"] }]);
    expect(repo.getCurrent()?.hasTool("claude")).toBe(true);
  });
});
