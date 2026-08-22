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
import { compareSemver } from "../../../src/domain/models/semver.js";
import { machineLocalFilesOf } from "../../../src/domain/tools/registry.js";
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

  it("does not call a machine-local file an addition, whatever the profile declares", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });
    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest missing");
    manifest.addTool("claude", "test", []);
    await deps.manifestRepo.save(manifest);

    // Written by the CLI on purpose and never tracked. The exclusion has to match the
    // path the profile declares, not a prefix the tool's directory happens to share:
    // reading it off `machineLocalFilesOf` is what keeps the two in step.
    for (const relativePath of machineLocalFilesOf("claude")) {
      await deps.fs.writeFile(`${PROJECT_ROOT}/${relativePath}`, "{}");
    }
    expect(machineLocalFilesOf("claude").length).toBeGreaterThan(0);

    const report = await new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    ).execute({ projectRoot: PROJECT_ROOT });

    const drifted = report.tools.flatMap((tool) => tool.drifted);
    expect(drifted).toEqual([]);
    expect(report.inSync).toBe(true);
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
