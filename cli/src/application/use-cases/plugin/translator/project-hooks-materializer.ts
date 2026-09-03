import { join } from "node:path";
import {
  cursorProjectHooksScriptPath,
  mergeCursorProjectHooksJson,
} from "../../../../domain/formats/cursor-hooks-project-merge.js";
import {
  type PluginComponentFile,
  PluginDistribution,
} from "../../../../domain/models/plugin-distribution.js";
import type {
  PluginTranslationSkip,
  ReadonlySkipList,
} from "../../../../domain/models/plugin-translation-skip.js";
import type { AiToolId } from "../../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import { resolvePluginsCapability } from "../../../../domain/tools/registry.js";

const HOOKS_MANIFEST_PATH = "hooks/hooks.json";

/**
 * Delivers a plugin's hooks to the destination a `hooksDestination: "project"`
 * capability names — merged into the project's own hooks file, scripts copied
 * beside it — rather than into the plugin's own directory. The single place both
 * materialization routes (Mode B flat, and the marketplace-sourced built-tree copy)
 * call, so where a tool's hooks land is decided by its own declaration, never by
 * which translator happened to run — see measurements.md, Phase 7, Task 2.
 */
export class ProjectHooksMaterializer {
  constructor(private readonly fs: FileWriter & FileReader) {}

  async materialize(
    dist: PluginDistribution,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<ReadonlySkipList> {
    const pluginsCap = resolvePluginsCapability(toolId);
    if (pluginsCap === null || pluginsCap.hooksDestination !== "project") return [];
    const manifestFile = dist.components.hooks.find((f) => f.relativePath === HOOKS_MANIFEST_PATH);
    if (manifestFile === undefined) return [];
    const warnings = await this.mergeProjectHooksJson(dist, manifestFile, projectRoot);
    await this.writeProjectHooksScripts(dist, projectRoot);
    return warnings.map(
      (reason): PluginTranslationSkip => ({
        pluginName: dist.manifest.name,
        component: "hooks",
        toolId,
        reason,
      })
    );
  }

  private async mergeProjectHooksJson(
    dist: PluginDistribution,
    manifestFile: PluginComponentFile,
    projectRoot: string
  ): Promise<readonly string[]> {
    const destPath = join(projectRoot, ".cursor", "hooks.json");
    const existing = await this.readExistingJson(destPath);
    const { content, warnings } = mergeCursorProjectHooksJson(
      existing,
      manifestFile.content,
      dist.manifest.name
    );
    await this.fs.writeFile(destPath, content);
    return warnings;
  }

  private async writeProjectHooksScripts(
    dist: PluginDistribution,
    projectRoot: string
  ): Promise<void> {
    for (const file of dist.components.hooks) {
      if (file.relativePath === HOOKS_MANIFEST_PATH) continue;
      const dest = cursorProjectHooksScriptPath(dist.manifest.name, file.relativePath);
      await this.fs.writeFile(join(projectRoot, dest), file.content);
    }
  }

  private async readExistingJson(path: string): Promise<string | null> {
    try {
      return await this.fs.readFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}

/** A copy of `dist` with every `hooks/` file dropped, both from `files` (what the
 * generic native translator walks) and from `components.hooks` (what a hooks-trust
 * notice reads) — for a capability declaring `hooksDestination: "project"`, so none
 * of its hooks are written under the plugin's own directory, only via `materialize`. */
export function withoutHooks(dist: PluginDistribution): PluginDistribution {
  return new PluginDistribution({
    manifest: dist.manifest,
    format: dist.format,
    files: dist.files.filter((f) => f.relativePath.split("/")[0] !== "hooks"),
    components: { ...dist.components, hooks: [] },
  });
}
