import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UninstallIdeUseCase } from "../../../../src/contexts/framework/application/uninstall/uninstall-ide-use-case.js";
import { UninstallToolsUseCase } from "../../../../src/contexts/framework/application/uninstall/uninstall-tools-use-case.js";
import { buildUnitDeps, initProject, installTool } from "../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";
const SETTINGS = join(PROJECT_ROOT, ".vscode/settings.json");
const EXTENSIONS = join(PROJECT_ROOT, ".vscode/extensions.json");

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

function makeUseCase(deps: Deps): UninstallIdeUseCase {
  return new UninstallIdeUseCase(
    deps.manifestRepo,
    new UninstallToolsUseCase(deps.fs, deps.logger)
  );
}

function parse(raw: string | undefined): Record<string, unknown> {
  return JSON.parse(raw ?? "{}") as Record<string, unknown>;
}

describe("UninstallIdeUseCase — merge-file entries", () => {
  it("removes the keys it merged into a shared settings file", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");

    const managedKeys = Object.keys(parse(deps.fs.getFile(SETTINGS)));
    expect(managedKeys.length).toBeGreaterThan(0);

    await makeUseCase(deps).execute({ toolId: "vscode", projectRoot: PROJECT_ROOT });

    const after = parse(deps.fs.getFile(SETTINGS));
    for (const key of managedKeys) {
      expect(Object.keys(after)).not.toContain(key);
    }
  });

  it("leaves a user-authored key in that shared file untouched", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");

    const withUserKey = { ...parse(deps.fs.getFile(SETTINGS)), "editor.tabSize": 7 };
    await deps.fs.writeFile(SETTINGS, JSON.stringify(withUserKey, null, 2));

    await makeUseCase(deps).execute({ toolId: "vscode", projectRoot: PROJECT_ROOT });

    expect(parse(deps.fs.getFile(SETTINGS))["editor.tabSize"]).toBe(7);
  });

  it("removes its merged keys from every declared merge file, not just settings.json", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");

    const before = Object.keys(parse(deps.fs.getFile(EXTENSIONS)));
    expect(before.length).toBeGreaterThan(0);

    await makeUseCase(deps).execute({ toolId: "vscode", projectRoot: PROJECT_ROOT });

    const after = parse(deps.fs.getFile(EXTENSIONS));
    for (const key of before) {
      expect(Object.keys(after)).not.toContain(key);
    }
  });

  it("drops the tool from the manifest", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");

    await makeUseCase(deps).execute({ toolId: "vscode", projectRoot: PROJECT_ROOT });

    const manifest = await deps.manifestRepo.load();
    expect(manifest?.hasTool("vscode")).toBe(false);
  });
});
