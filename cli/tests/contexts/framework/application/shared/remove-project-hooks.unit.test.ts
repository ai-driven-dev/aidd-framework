import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { removeProjectHooks } from "../../../../../src/contexts/framework/application/shared/remove-project-hooks.js";
import {
  errnoError,
  FaultingFileAdapter,
} from "../../../../helpers/ports/faulting-file-adapter.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const PLUGIN = "aidd-context";
const OTHER = "aidd-dev";
const HOOKS_PATH = join(PROJECT_ROOT, ".cursor", "hooks.json");
const SCRIPT_PATH = join(PROJECT_ROOT, ".cursor", "hooks", PLUGIN, "pre.js");

function entry(plugin: string): { command: string } {
  return { command: `node ./.cursor/hooks/${plugin}/pre.js` };
}

function hooksFile(...plugins: string[]): string {
  return JSON.stringify({ version: 1, hooks: { preToolUse: plugins.map(entry) } });
}

describe("removeProjectHooks", () => {
  it("leaves a tool that keeps hooks in its plugin directory untouched and reports nothing undone", async () => {
    const fs = new InMemoryFileAdapter({ [HOOKS_PATH]: hooksFile(PLUGIN) });

    expect(await removeProjectHooks(fs, PLUGIN, "opencode", PROJECT_ROOT)).toBe(false);
    expect(fs.getFile(HOOKS_PATH)).toBe(hooksFile(PLUGIN));
  });

  it("reports nothing undone when neither the hooks file nor the script directory exists", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("deleteDirectory", `${PROJECT_ROOT}/.cursor/hooks/${PLUGIN}/`, errnoError("EPERM"));

    expect(await removeProjectHooks(fs, PLUGIN, "cursor", PROJECT_ROOT)).toBe(false);
  });

  it("unmerges only this plugin's entries and reports something undone when just the hooks file exists", async () => {
    const fs = new InMemoryFileAdapter({ [HOOKS_PATH]: hooksFile(PLUGIN, OTHER) });

    const undone = await removeProjectHooks(fs, PLUGIN, "cursor", PROJECT_ROOT);

    expect(undone).toBe(true);
    expect(JSON.parse(fs.getFile(HOOKS_PATH) ?? "null")).toStrictEqual({
      version: 1,
      hooks: { preToolUse: [entry(OTHER)] },
    });
  });

  it("removes the script directory and reports something undone when only the scripts exist", async () => {
    const fs = new InMemoryFileAdapter({ [SCRIPT_PATH]: "module.exports = () => {};" });

    const undone = await removeProjectHooks(fs, PLUGIN, "cursor", PROJECT_ROOT);

    expect(undone).toBe(true);
    expect(fs.listAll()).toStrictEqual([]);
  });

  it("propagates a failure to read the hooks file other than its absence", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("readFile", HOOKS_PATH, errnoError("EACCES"));

    await expect(removeProjectHooks(fs, PLUGIN, "cursor", PROJECT_ROOT)).rejects.toThrow(
      "EACCES: planted by the test"
    );
  });
});
