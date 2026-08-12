import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import "../../../src/domain/tools/ide/vscode.js";
import { InitUseCase } from "../../../src/application/use-cases/init-use-case.js";
import { DetectPluginDriftUseCase } from "../../../src/application/use-cases/shared/detect-plugin-drift-use-case.js";
import { StatusUseCase } from "../../../src/application/use-cases/status-use-case.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { Plugin } from "../../../src/domain/models/plugin.js";
import { compareSemver } from "../../../src/domain/models/semver.js";
import type { ToolId } from "../../../src/domain/tools/registry.js";
import { buildUnitDeps } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("status", () => {
  it("reports no drift when no tools are installed", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });

    const useCase = new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    );
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.tools).toHaveLength(0);
    expect(report.inSync).toBe(true);
  });

  it("scans the shared tree a tool claims outside its own directory", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", []);
    manifest.addPlugin(
      "codex" as ToolId,
      Plugin.fromJSON({
        name: "aidd-context",
        source: { kind: "local", path: "/fixtures/plugin" },
        version: "1.0.0",
        strict: false,
        files: { ".agents/skills/aidd-context/SKILL.md": "0".repeat(32) },
      })
    );
    await deps.manifestRepo.save(manifest);
    // Untracked, and outside .codex/ — invisible while only the tool's own directory was scanned.
    await deps.fs.writeFile(`${PROJECT_ROOT}/.agents/skills/stray.md`, "# stray\n");

    const useCase = new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    );
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    const added = report.tools.flatMap((t) => t.drifted).filter((d) => d.status === "added");
    expect(added.map((d) => d.relativePath)).toContain(".agents/skills/stray.md");
  });

  describe("compareSemver()", () => {
    it("orders lower major version as smaller", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    });

    it("orders lower minor version as smaller", () => {
      expect(compareSemver("3.1.0", "3.2.0")).toBe(-1);
    });

    it("orders higher patch version as greater", () => {
      expect(compareSemver("3.1.1", "3.1.0")).toBe(1);
    });

    it("treats identical versions as equal", () => {
      expect(compareSemver("3.1.0", "3.1.0")).toBe(0);
    });

    it("handles v-prefix", () => {
      expect(compareSemver("3.0.0", "v3.1.0")).toBe(-1);
    });
  });
});
