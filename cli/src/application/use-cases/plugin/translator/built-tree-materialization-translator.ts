import { join, posix } from "node:path";
import { flatHooksSharedDirPath } from "../../../../domain/formats/flat-paths.js";
import { InstallationFile } from "../../../../domain/models/file.js";
import type { Manifest } from "../../../../domain/models/manifest.js";
import { Plugin } from "../../../../domain/models/plugin.js";
import type { PluginDistribution } from "../../../../domain/models/plugin-distribution.js";
import type { PluginSource } from "../../../../domain/models/plugin-source.js";
import type { ReadonlySkipList } from "../../../../domain/models/plugin-translation-skip.js";
import type { AiToolId } from "../../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../../domain/ports/hasher.js";
import type { MarketplaceRegistry } from "../../../../domain/ports/marketplace-registry.js";
import { resolvePluginsCapability } from "../../../../domain/tools/registry.js";
import type { EnsureBuiltMarketplace } from "../../shared/ensure-built-marketplace-use-case.js";
import { isPluginFileAtDesiredState } from "../plugin-file-sync.js";
import { resolvePluginBaseDir } from "../plugin-target-resolution.js";
import { ModeBFlatMaterializationTranslator } from "./mode-b-flat-materialization-translator.js";
import type { PluginTranslator } from "./plugin-translator.js";
import { ProjectHooksMaterializer } from "./project-hooks-materializer.js";

/**
 * Materializes plugin content by copying the per-target BUILT tree verbatim into the
 * tool's plugin directory — so installed bytes equal `framework build` output. Bypasses
 * the per-file content transform (build already did it). For marketplace-sourced installs
 * only; raw local-path installs fall back to flat materialization.
 *
 * componentPaths is left empty (sync does not propagate built plugins), matching the
 * existing local-marketplace behavior in PluginUpdateUseCase.
 */
export class BuiltTreeMaterializationTranslator implements PluginTranslator {
  readonly mode = "flat" as const;
  private readonly projectHooks: ProjectHooksMaterializer;

  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly hasher: Hasher,
    private readonly homedir: () => string,
    private readonly ensureBuilt: EnsureBuiltMarketplace,
    private readonly marketplaceRegistry: MarketplaceRegistry
  ) {
    this.projectHooks = new ProjectHooksMaterializer(fs);
  }

  async addPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    docsDir: string,
    previousMcpEntries: ReadonlyMap<string, string> = new Map()
  ): Promise<{ skipped: ReadonlySkipList; written?: number }> {
    const resolved =
      marketplace === undefined ? null : await this.findMarketplace(marketplace, projectRoot);
    if (marketplace === undefined || resolved === null) {
      return this.fallback().addPlugin(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        docsDir,
        previousMcpEntries
      );
    }
    const mode = toolId === "opencode" ? "flat" : "marketplace";
    const { builtDir } = await this.ensureBuilt.execute({
      projectRoot,
      marketplace: resolved,
      target: toolId,
      mode,
    });
    const builtFiles =
      mode === "flat"
        ? await this.readFlatFiles(builtDir, dist, toolId)
        : await this.readBuiltFiles(
            join(builtDir, "plugins", dist.manifest.name),
            dist.manifest.name
          );
    // The built tree still carries a plugin-scoped hooks/hooks.json for a capability
    // declaring hooksDestination "project" (the marketplace build never learned that
    // route exists) — dropped here, and materialized through the same project-hooks
    // side channel the local-source route uses, so both land in the one place the
    // tool's own declaration names, not wherever this particular build happened to put it.
    const deliversHooksToProject = resolvePluginsCapability(toolId)?.hooksDestination === "project";
    const hooksSkips = deliversHooksToProject
      ? await this.projectHooks.materialize(dist, toolId, projectRoot)
      : [];
    const files = deliversHooksToProject
      ? withoutHooksPrefix(builtFiles, dist.manifest.name)
      : builtFiles;
    const baseDir =
      mode === "flat" ? projectRoot : resolvePluginBaseDir(toolId, projectRoot, this.homedir);
    const written = await this.writeChangedFiles(files, baseDir);
    manifest.addPlugin(
      toolId,
      Plugin.fromDistribution(dist, source, files, new Map(), marketplace)
    );
    return { skipped: hooksSkips, written };
  }

  // Verbatim-copies the built subtree, but skips files already matching the built
  // content on disk so a no-op restore reports (and performs) zero writes.
  private async writeChangedFiles(files: InstallationFile[], baseDir: string): Promise<number> {
    let written = 0;
    for (const f of files) {
      const outputPath = join(baseDir, f.relativePath);
      if (await isPluginFileAtDesiredState(this.fs, this.hasher, outputPath, f.hash.value)) {
        continue;
      }
      await this.fs.writeFile(outputPath, f.content);
      written++;
    }
    return written;
  }

  // Marketplace build emits plugins/<name>/<rel>; user-scope tools install at
  // <baseDir>/<name>/<rel>, so the manifest relativePath keeps the <name>/ prefix.
  private async readBuiltFiles(pluginSrc: string, name: string): Promise<InstallationFile[]> {
    const absPaths = await this.fs.listFilesRecursive(pluginSrc);
    return Promise.all(
      absPaths.map(async (abs) => {
        const rel = abs.slice(pluginSrc.length + 1);
        const content = await this.fs.readFile(abs);
        return new InstallationFile({
          // relativePath is always "/"-separated (see withoutHooksPrefix and
          // belongsToPlugin below, both string-matching on "/") - node:path's platform
          // `join` would answer with "\" on win32, breaking both.
          relativePath: posix.join(name, rel),
          content,
          hash: this.hasher.hash(content),
        });
      })
    );
  }

  // Flat build emits the whole marketplace into one workspace. Agents are namespaced
  // by .opencode/agents/<plugin>-<name>...; skills instead nest the whole subtree
  // under .opencode/skills/<plugin>/... (genericFlatSkillTreePath — a skill's own
  // script can require() a sibling by relative path, which only keeps resolving
  // when nothing under the plugin's skills/ subtree gets renamed). Install copies
  // only this plugin's files by whichever convention its section uses. Hooks are not
  // namespaced — flatHooksDir is one directory the tool's loader scans flat (see
  // flatHooksSharedDirPath) — so this plugin's own hook filenames are matched by name
  // instead, from its own distribution.
  private async readFlatFiles(
    builtDir: string,
    dist: PluginDistribution,
    toolId: AiToolId
  ): Promise<InstallationFile[]> {
    const name = dist.manifest.name;
    const hookPaths = this.flatHookOutputPaths(dist, toolId);
    const absPaths = await this.fs.listFilesRecursive(builtDir);
    const files: InstallationFile[] = [];
    for (const abs of absPaths) {
      const rel = abs.slice(builtDir.length + 1);
      if (!this.belongsToPlugin(rel, name) && !hookPaths.has(rel)) continue;
      const content = await this.fs.readFile(abs);
      files.push(
        new InstallationFile({ relativePath: rel, content, hash: this.hasher.hash(content) })
      );
    }
    return files;
  }

  private belongsToPlugin(rel: string, name: string): boolean {
    const segments = rel.split("/");
    if (segments[0] !== ".opencode" || segments.length < 3) return false;
    // skills/ nests the whole plugin under one exactly-named segment (see the comment
    // above); every other flat section still hyphen-prefixes the leaf segment.
    if (segments[1] === "skills") return segments[2] === name;
    return segments[2].startsWith(`${name}-`);
  }

  private flatHookOutputPaths(dist: PluginDistribution, toolId: AiToolId): ReadonlySet<string> {
    const flatHooksDir = resolvePluginsCapability(toolId)?.flatHooksDir;
    if (flatHooksDir === null || flatHooksDir === undefined) return new Set();
    return new Set(
      dist.components.hooks
        .filter((f) => f.relativePath !== "hooks/hooks.json")
        .map((f) => flatHooksSharedDirPath(flatHooksDir, f.relativePath))
    );
  }

  private async findMarketplace(name: string, projectRoot: string) {
    const all = await this.marketplaceRegistry.list(projectRoot);
    return all.find((m) => m.name === name) ?? null;
  }

  private fallback(): ModeBFlatMaterializationTranslator {
    return new ModeBFlatMaterializationTranslator(this.fs, this.hasher, this.homedir);
  }
}

// readBuiltFiles prefixes every path with "<name>/" (see its own comment above) — a
// built-tree hooks file therefore always reads "<name>/hooks/<rest>".
function withoutHooksPrefix(files: InstallationFile[], pluginName: string): InstallationFile[] {
  const hooksPrefix = `${pluginName}/hooks/`;
  return files.filter((f) => !f.relativePath.startsWith(hooksPrefix));
}
