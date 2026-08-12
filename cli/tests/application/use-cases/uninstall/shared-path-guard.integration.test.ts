import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/gemini.js";
import { UninstallUseCase } from "../../../../src/application/use-cases/uninstall/uninstall-use-case.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import type { ToolId } from "../../../../src/domain/tools/registry.js";
import { buildUnitDeps, initProject, installTool } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";

const PROJECT_ROOT = "/test-project";
const PLUGIN_NAME = "aidd-context";

/** Co-owned: both codex and gemini render the shared skills tree to the same path. */
const SHARED_PATH = ".agents/skills/aidd-context/SKILL.md";
/** Owned by codex alone, so it proves the guard does not retain everything. */
const CODEX_ONLY_PATH = ".codex/agents/aidd-context.md";

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

function buildPlugin(files: Record<string, string>): Plugin {
  return Plugin.fromJSON({
    name: PLUGIN_NAME,
    source: { kind: "local", path: "/fixtures/aidd-context" },
    version: "1.0.0",
    strict: false,
    files,
  });
}

/** Installs both tools, then claims the co-owned path from each of them through a plugin. */
async function seedTwoOwners(deps: Deps): Promise<void> {
  await initProject(deps, PROJECT_ROOT);
  await installTool(deps, PROJECT_ROOT, "codex" as ToolId);
  await installTool(deps, PROJECT_ROOT, "gemini" as ToolId);

  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("manifest was not created by initProject");
  manifest.addPlugin(
    "codex" as ToolId,
    buildPlugin({ [SHARED_PATH]: "hash-shared", [CODEX_ONLY_PATH]: "hash-codex" })
  );
  manifest.addPlugin("gemini" as ToolId, buildPlugin({ [SHARED_PATH]: "hash-shared" }));
  await deps.manifestRepo.save(manifest);

  await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), "# shared skill\n");
  await deps.fs.writeFile(join(PROJECT_ROOT, CODEX_ONLY_PATH), "# codex agent\n");
}

function buildUninstall(deps: Deps, logger: CapturingLogger): UninstallUseCase {
  return new UninstallUseCase(deps.fs, deps.manifestRepo, logger);
}

describe("shared path guard", () => {
  it("keeps a co-owned file when one of its two owners is removed", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedTwoOwners(deps);

    await buildUninstall(deps, new CapturingLogger()).execute({
      toolIds: ["codex" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: PLUGIN_NAME,
    });

    expect(deps.fs.has(join(PROJECT_ROOT, SHARED_PATH))).toBe(true);
  });

  it("deletes a path the departing owner holds alone", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedTwoOwners(deps);

    await buildUninstall(deps, new CapturingLogger()).execute({
      toolIds: ["codex" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: PLUGIN_NAME,
    });

    expect(deps.fs.has(join(PROJECT_ROOT, CODEX_ONLY_PATH))).toBe(false);
  });

  it("reports every retained file, naming the owner that still claims it", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedTwoOwners(deps);
    const logger = new CapturingLogger();

    await buildUninstall(deps, logger).execute({
      toolIds: ["codex" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: PLUGIN_NAME,
    });

    const retentions = logger.warnMessages.filter((m) => m.includes(SHARED_PATH));
    expect(retentions).toHaveLength(1);
    expect(retentions[0]).toContain("gemini");
  });

  it("deletes the co-owned file once its last owner is removed", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedTwoOwners(deps);
    const uninstall = buildUninstall(deps, new CapturingLogger());

    await uninstall.execute({
      toolIds: ["codex" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: PLUGIN_NAME,
    });
    await uninstall.execute({
      toolIds: ["gemini" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
      pluginName: PLUGIN_NAME,
    });

    expect(deps.fs.has(join(PROJECT_ROOT, SHARED_PATH))).toBe(false);
  });

  it("keeps a plugin-owned path when the tool that co-owns it is uninstalled whole", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedTwoOwners(deps);

    await buildUninstall(deps, new CapturingLogger()).execute({
      toolIds: ["codex" as ToolId],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
    });

    expect(deps.fs.has(join(PROJECT_ROOT, SHARED_PATH))).toBe(true);
  });
});
