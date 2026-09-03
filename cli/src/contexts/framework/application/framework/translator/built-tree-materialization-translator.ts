import { join } from "node:path";
import { InstallationFile } from "../../../../../kernel/file.js";
import type { FileReader } from "../../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../../kernel/ports/hasher.js";
import type { PluginSource } from "../../../../../kernel/source.js";
import type { AiToolId } from "../../../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../../../distribution/domain/ports/marketplace-registry.js";
import { frameworkBuildModeFor } from "../../../../tools/domain/registry.js";
import type { PluginDistribution } from "../../../../translate/domain/plugin-distribution.js";
import type { ReadonlySkipList } from "../../../../translate/domain/plugin-translation-skip.js";
import type { Manifest } from "../../../domain/manifest.js";
import { InstalledPlugin } from "../../../domain/plugins/installed-plugin.js";
import { isPluginFileAtDesiredState, resolvePluginBaseDir } from "../../plugin/plugin-helpers.js";
import type { EnsureBuiltMarketplaceUseCase } from "../../shared/ensure-built-marketplace-use-case.js";
import { ModeBFlatMaterializationTranslator } from "./mode-b-flat-materialization-translator.js";
import type { PluginTranslator } from "./plugin-translator.js";

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

  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly hasher: Hasher,
    private readonly homedir: () => string,
    private readonly ensureBuilt: EnsureBuiltMarketplaceUseCase,
    private readonly marketplaceRegistry: MarketplaceRegistry
  ) {}

  async addPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
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
        previousMcpEntries
      );
    }
    const mode = frameworkBuildModeFor(toolId);
    const { builtDir } = await this.ensureBuilt.execute({
      projectRoot,
      marketplace: resolved,
      target: toolId,
      mode,
    });
    const files =
      mode === "flat"
        ? await this.readFlatFiles(builtDir, dist.manifest.name)
        : await this.readBuiltFiles(
            join(builtDir, "plugins", dist.manifest.name),
            dist.manifest.name
          );
    const baseDir =
      mode === "flat" ? projectRoot : resolvePluginBaseDir(toolId, projectRoot, this.homedir);
    const written = await this.writeChangedFiles(files, baseDir);
    manifest.addPlugin(
      toolId,
      InstalledPlugin.fromDistribution(dist, source, files, new Map(), marketplace)
    );
    return { skipped: [], written };
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
          relativePath: join(name, rel),
          content,
          hash: this.hasher.hash(content),
        });
      })
    );
  }

  // Flat build emits the whole marketplace into one workspace, namespaced by
  // .opencode/<section>/<plugin>-<name>/...; install copies only this plugin's files.
  private async readFlatFiles(builtDir: string, name: string): Promise<InstallationFile[]> {
    const absPaths = await this.fs.listFilesRecursive(builtDir);
    const files: InstallationFile[] = [];
    for (const abs of absPaths) {
      const rel = abs.slice(builtDir.length + 1);
      if (!this.belongsToPlugin(rel, name)) continue;
      const content = await this.fs.readFile(abs);
      files.push(
        new InstallationFile({ relativePath: rel, content, hash: this.hasher.hash(content) })
      );
    }
    return files;
  }

  private belongsToPlugin(rel: string, name: string): boolean {
    const segments = rel.split("/");
    return (
      segments[0] === ".opencode" && segments.length >= 3 && segments[2].startsWith(`${name}-`)
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
