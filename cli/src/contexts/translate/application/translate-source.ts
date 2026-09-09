import { join, resolve } from "node:path";
import { InvalidBuildPathsError, InvalidSourceMarketplaceError } from "../../../kernel/errors.js";
import { pathsOverlap } from "../../../kernel/paths.js";
import type { AssetProvider } from "../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import type { JsonSchemaValidator } from "../../tools/domain/ports/schema-validator.js";
import {
  type BuildPluginResult,
  type FrameworkBuildOptions,
  type FrameworkBuildResult,
  OUT_OF_SCOPE_PLUGIN_SECTIONS,
  SOURCE_MARKETPLACE_RELATIVE,
  SOURCE_PLUGIN_MANIFEST_RELATIVE,
} from "../domain/build-target.js";
import type {
  BuildOutputStrategy,
  SourceMarketplace,
  SourcePluginEntry,
} from "./strategies/build-output-strategy.js";

/** Running one framework build, as its callers need it. */
export interface FrameworkBuild {
  execute(options: FrameworkBuildOptions): Promise<FrameworkBuildResult>;
}

export class FrameworkBuildUseCase implements FrameworkBuild {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly jsonSchemaValidator: JsonSchemaValidator,
    private readonly assetProvider: AssetProvider,
    private readonly logger: Logger,
    private readonly strategy: BuildOutputStrategy
  ) {}

  async execute(options: FrameworkBuildOptions): Promise<FrameworkBuildResult> {
    const sourceDir = resolve(options.sourceDir);
    const outDir = resolve(options.outDir);
    this.guardPaths(sourceDir, outDir);
    const sourceMarketplace = await this.readSourceMarketplace(sourceDir);
    await this.strategy.preBuild(outDir, sourceDir);
    const builtPlugins: BuildPluginResult[] = [];
    for (const entry of sourceMarketplace.plugins) {
      const plugin = await this.buildPlugin(entry, sourceDir, outDir);
      builtPlugins.push(plugin);
    }
    const extraFiles = await this.strategy.postBuild(sourceMarketplace, builtPlugins, outDir);
    const totalFiles = builtPlugins.reduce((sum, p) => sum + p.filesWritten, 0) + extraFiles;
    return { outDir, plugins: builtPlugins, totalFiles };
  }

  private guardPaths(sourceDir: string, outDir: string): void {
    if (pathsOverlap(sourceDir, outDir)) throw new InvalidBuildPathsError(sourceDir, outDir);
  }

  private async readSourceMarketplace(sourceDir: string): Promise<SourceMarketplace> {
    const marketplacePath = join(sourceDir, SOURCE_MARKETPLACE_RELATIVE);
    let raw: string;
    try {
      raw = await this.fs.readFile(marketplacePath);
    } catch {
      throw new InvalidSourceMarketplaceError(`cannot read ${marketplacePath}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new InvalidSourceMarketplaceError(`malformed JSON: ${(err as Error).message}`);
    }
    return this.validateSourceMarketplace(parsed);
  }

  private validateSourceMarketplace(parsed: unknown): SourceMarketplace {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidSourceMarketplaceError("root must be an object");
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.plugins)) {
      throw new InvalidSourceMarketplaceError("missing 'plugins' array");
    }
    for (const entry of obj.plugins as unknown[]) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as Record<string, unknown>).name !== "string"
      ) {
        throw new InvalidSourceMarketplaceError("each plugin entry must have a 'name' string");
      }
    }
    return obj as unknown as SourceMarketplace;
  }

  private async buildPlugin(
    entry: SourcePluginEntry,
    sourceDir: string,
    outDir: string
  ): Promise<BuildPluginResult> {
    const pluginSrc = join(sourceDir, "plugins", entry.name);
    if (!(await this.fs.fileExists(pluginSrc))) {
      throw new InvalidSourceMarketplaceError(`plugin '${entry.name}' not found at ${pluginSrc}`);
    }
    await this.validateManifest(pluginSrc);
    let filesWritten = 0;
    filesWritten += await this.strategy.writePluginManifest(entry.name, pluginSrc, outDir);
    filesWritten += await this.strategy.writeAgents(entry.name, pluginSrc, outDir);
    filesWritten += await this.strategy.writeSkills(entry.name, pluginSrc, outDir);
    filesWritten += await this.strategy.writeHooks(entry.name, pluginSrc, outDir);
    filesWritten += await this.strategy.writeMcp(entry.name, pluginSrc, outDir);
    const skippedSections = await this.warnOutOfScopeSections(entry.name, pluginSrc);
    return { name: entry.name, filesWritten, skippedSections };
  }

  private async validateManifest(pluginSrc: string): Promise<void> {
    const manifestPath = join(pluginSrc, SOURCE_PLUGIN_MANIFEST_RELATIVE);
    const raw = await this.fs.readFile(manifestPath);
    const data = JSON.parse(raw) as unknown;
    this.jsonSchemaValidator.validate(this.assetProvider.loadSchema("plugin-manifest"), data);
  }

  private async warnOutOfScopeSections(
    pluginName: string,
    pluginSrc: string
  ): Promise<readonly string[]> {
    const skipped: string[] = [];
    for (const section of OUT_OF_SCOPE_PLUGIN_SECTIONS) {
      if (await this.fs.fileExists(join(pluginSrc, section))) {
        this.logger.warn(`Skipping ${section}/ in plugin '${pluginName}' (out of scope for MVP1).`);
        skipped.push(section);
      }
    }
    return skipped;
  }
}
