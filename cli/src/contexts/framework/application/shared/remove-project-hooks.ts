import { dirname, join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import {
  cursorProjectHooksScriptDir,
  unmergeCursorProjectHooksJson,
} from "../../../tools/domain/formats/cursor-hooks-project-merge.js";
import { resolvePluginsCapability } from "../../../tools/domain/registry.js";

/**
 * Undoes what `ProjectHooksMaterializer` wrote for one plugin: a tool declaring
 * `hooksDestination: "project"` (Cursor) merges a plugin's hooks into the project's own
 * hooks file rather than tracking them in `Plugin.files` (see
 * `mode-b-flat-materialization-translator.ts`), so removal needs its own unmerge
 * instead of a baseDir-relative file delete. Both destinations are recomputed from
 * `pluginName` alone, exactly as install computed them — no extra state to keep in
 * sync. A no-op for a tool that declares no project-merged hooks destination, and for
 * one with nothing yet written there.
 *
 * Shared between `PluginRemoveUseCase` (one plugin) and `CleanUseCase` (every plugin):
 * both undo the same install-time write, and a second private copy would be the exact
 * duplication `0-shared-modules.md` exists to name.
 *
 * Returns whether anything was actually there to undo — `CleanUseCase` counts it,
 * `PluginRemoveUseCase` does not need to.
 */
export async function removeProjectHooks(
  fs: FileReader & FileWriter,
  pluginName: string,
  toolId: AiToolId,
  projectRoot: string
): Promise<boolean> {
  const pluginsCap = resolvePluginsCapability(toolId);
  if (pluginsCap?.hooksDestination !== "project") return false;
  const projectHooksRelativePath = pluginsCap.projectHooksRelativePath;
  if (projectHooksRelativePath === null) return false;
  const hooksPath = join(projectRoot, projectHooksRelativePath);
  const existing = await readExistingJson(fs, hooksPath);
  if (existing !== null) {
    const unmerged = unmergeCursorProjectHooksJson(existing, pluginName);
    // A file this route wrote in the first place — leaving it as an empty shell once
    // its last plugin is gone is the same residue clean exists to stop leaving.
    if (isHooksFileEmpty(unmerged)) await fs.deleteFile(hooksPath);
    else await fs.writeFile(hooksPath, unmerged);
  }
  const scriptDir = join(projectRoot, cursorProjectHooksScriptDir(pluginName));
  const hadScriptDir = await fs.fileExists(scriptDir);
  if (hadScriptDir) {
    await fs.deleteDirectory(scriptDir);
    await fs.deleteEmptyDirectories(dirname(scriptDir));
  }
  return existing !== null || hadScriptDir;
}

async function readExistingJson(fs: FileReader, path: string): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function isHooksFileEmpty(hooksJson: string): boolean {
  const parsed = JSON.parse(hooksJson) as { hooks?: Record<string, unknown> };
  return Object.keys(parsed.hooks ?? {}).length === 0;
}
